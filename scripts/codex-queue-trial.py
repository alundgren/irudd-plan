"""Exercise the real Codex queue with isolated storage and a localhost fake model.

No existing session is targeted, and model responses contain no tool calls.
Optional arguments enable the local irudd-plan companion integration trial.
"""

import http.server, json, os, pathlib, subprocess, tempfile, threading, time, sys, urllib.request
root = pathlib.Path(tempfile.mkdtemp(prefix='irudd-queue-trial-'))
work = root / 'work'
work.mkdir()
home = root / 'codex'
home.mkdir()
requests = []
gate = threading.Event()
gate.set()

class Handler(http.server.BaseHTTPRequestHandler):

    def log_message(self, *a):
        pass

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        requests.append(body)
        self.send_response(200)
        self.send_header('Content-Type', 'text/event-stream')
        self.end_headers()

        def emit(x):
            self.wfile.write(('data: ' + json.dumps(x) + '\n\n').encode())
            self.wfile.flush()
        try:
            emit({'type': 'response.created', 'response': {'id': 'response-test'}})
            gate.wait(40)
            emit({'type': 'response.output_item.done', 'item': {'type': 'message', 'role': 'assistant', 'id': 'message-test', 'content': [{'type': 'output_text', 'text': 'Disposable queue trial complete.'}]}})
            emit({'type': 'response.completed', 'response': {'id': 'response-test', 'usage': {'input_tokens': 0, 'output_tokens': 0, 'total_tokens': 0}}})
        except (BrokenPipeError, ConnectionResetError):
            pass
server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
(home / 'config.toml').write_text(f'model = "gpt-5.4"\nmodel_provider = "queue_trial"\napproval_policy = "never"\nsandbox_mode = "read-only"\nproject_doc_max_bytes = 0\n[features]\nhooks = false\n[model_providers.queue_trial]\nname = "queue trial"\nbase_url = "http://127.0.0.1:{server.server_port}/v1"\nwire_api = "responses"\nrequires_openai_auth = false\n')
env = {k: v for k, v in os.environ.items() if k in ['PATH', 'HOME', 'USER', 'LANG', 'TMPDIR']}
env['CODEX_HOME'] = str(home)

class App:

    def __init__(self):
        self.events = []
        self.cv = threading.Condition()
        self.n = 0
        self.err = open(root / f'app-{time.time_ns()}.log', 'w')
        self.p = subprocess.Popen(['codex', 'app-server'], cwd=work, env=env, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=self.err, text=True, start_new_session=True)
        threading.Thread(target=self.read, daemon=True).start()
        self.call('initialize', {'clientInfo': {'name': 'irudd-queue-trial', 'version': '1'}, 'capabilities': {'experimentalApi': True}})
        self.send({'method': 'initialized'})

    def read(self):
        for line in self.p.stdout:
            try:
                event = json.loads(line)
            except ValueError:
                continue
            with self.cv:
                self.events.append(event)
                self.cv.notify_all()

    def send(self, obj):
        self.p.stdin.write(json.dumps(obj) + '\n')
        self.p.stdin.flush()

    def wait(self, predicate, timeout=30, start=0):
        end = time.monotonic() + timeout
        with self.cv:
            while True:
                for event in self.events[start:]:
                    if predicate(event):
                        return event
                left = end - time.monotonic()
                if left <= 0:
                    raise TimeoutError(str(self.events[-5:]))
                self.cv.wait(left)

    def call(self, method, params):
        self.n += 1
        n = self.n
        self.send({'id': n, 'method': method, 'params': params})
        event = self.wait(lambda e: e.get('id') == n)
        if 'error' in event:
            raise RuntimeError(event)
        return event['result']

    def complete(self, start=0, timeout=30):
        return self.wait(lambda e: e.get('method') == 'turn/completed', timeout, start)

    def close(self):
        import signal
        if self.p.poll() is None:
            os.killpg(self.p.pid, signal.SIGTERM)
            try:
                self.p.wait(5)
            except subprocess.TimeoutExpired:
                os.killpg(self.p.pid, signal.SIGKILL)
                self.p.wait()
        self.err.close()
apps = []
companions = []

def queue_message(thread, message):
    p = subprocess.run(['codex', 'queue', '--thread', thread, '--message', message], cwd=work, env=env, capture_output=True, text=True, timeout=30)
    if p.returncode:
        raise RuntimeError(p.stderr)
    print(p.stdout.strip(), flush=True)
    return p.stdout
try:
    print('Trial directory:', root, flush=True)
    a = App()
    apps.append(a)
    thread = a.call('thread/start', {'cwd': str(work), 'model': 'gpt-5.4', 'modelProvider': 'queue_trial', 'approvalPolicy': 'never', 'sandbox': 'read-only'})['thread']['id']
    a.call('turn/start', {'threadId': thread, 'input': [{'type': 'text', 'text': 'Seed a disposable session.'}]})
    a.complete()
    print('PASS initial fake-model turn', flush=True)
    start = len(a.events)
    before = len(requests)
    t = time.monotonic()
    queue_message(thread, 'QUEUE_IDLE_MARKER')
    a.complete(start)
    assert len(requests) == before + 1
    assert 'QUEUE_IDLE_MARKER' in json.dumps(requests[-1])
    print('PASS idle cross-process queue wake', round(time.monotonic() - t, 2), 'seconds', flush=True)
    gate.clear()
    start = len(a.events)
    a.call('turn/start', {'threadId': thread, 'input': [{'type': 'text', 'text': 'BUSY_TURN_MARKER'}]})
    a.wait(lambda e: e.get('method') == 'turn/started', start=start)
    queue_message(thread, 'QUEUE_BUSY_MARKER')
    queued = a.call('thread/queue/list', {'threadId': thread})['data']
    assert len(queued) == 1
    gate.set()
    a.complete(start)
    a.wait(lambda e: e.get('method') == 'turn/completed' and e['params']['turn']['id'] != a.complete(start)['params']['turn']['id'], start=start)
    assert 'QUEUE_BUSY_MARKER' in json.dumps(requests[-1])
    print('PASS busy queue starts after current turn', flush=True)
    gate.clear()
    start = len(a.events)
    turn = a.call('turn/start', {'threadId': thread, 'input': [{'type': 'text', 'text': 'INTERRUPT_MARKER'}]})['turn']['id']
    a.wait(lambda e: e.get('method') == 'turn/started', start=start)
    a.call('turn/interrupt', {'threadId': thread, 'turnId': turn})
    a.complete(start)
    gate.set()
    before = len(requests)
    queue_message(thread, 'QUEUE_PAUSED_MARKER')
    time.sleep(12)
    assert len(requests) == before
    assert len(a.call('thread/queue/list', {'threadId': thread})['data']) == 1
    print('PASS interrupted session stays paused', flush=True)
    cold = a.call('thread/start', {'cwd': str(work), 'model': 'gpt-5.4', 'modelProvider': 'queue_trial', 'approvalPolicy': 'never', 'sandbox': 'read-only'})['thread']['id']
    start = len(a.events)
    a.call('turn/start', {'threadId': cold, 'input': [{'type': 'text', 'text': 'COLD_SEED'}]})
    a.complete(start)
    a.close()
    before = len(requests)
    queue_message(cold, 'QUEUE_COLD_MARKER')
    time.sleep(2)
    assert len(requests) == before
    b = App()
    apps.append(b)
    assert len(b.call('thread/queue/list', {'threadId': cold})['data']) == 1
    b.call('thread/resume', {'threadId': cold})
    b.complete()
    assert 'QUEUE_COLD_MARKER' in json.dumps(requests[-1])
    print('PASS unloaded queue waits for resume', flush=True)
    if len(sys.argv) > 1:
        service_url, plan_id, repo = sys.argv[1:]
        config = root / 'companion.json'
        config.write_text(json.dumps({'serverUrl': service_url, 'ownerId': 'owner-a', 'planId': plan_id, 'threadId': cold, 'stateDirectory': str(root / 'delivery'), 'cwd': str(work), 'codexHome': str(home), 'headersEnv': {'Authorization': 'QUEUE_TRIAL_ACCESS'}}))
        companion_env = {**env, 'QUEUE_TRIAL_ACCESS': 'Bearer token-a'}

        def command(mode):
            return ['vp', 'run', 'companion', mode, str(config)]
        init = subprocess.run(command('init'), cwd=repo, env=companion_env, capture_output=True, text=True, timeout=40)
        if init.returncode:
            raise RuntimeError(init.stdout + init.stderr)
        print(init.stdout.strip(), flush=True)

        def start_companion():
            log = open(root / f'companion-{time.time_ns()}.log', 'w')
            child = subprocess.Popen(command('run'), cwd=repo, env=companion_env, stdout=log, stderr=log, start_new_session=True)
            companions.append((child, log))
            return child

        def stop_companion(child):
            import signal
            if child.poll() is None:
                os.killpg(child.pid, signal.SIGTERM)
                try:
                    child.wait(8)
                except subprocess.TimeoutExpired:
                    os.killpg(child.pid, signal.SIGKILL)
                    child.wait()

        def planning():
            req = urllib.request.Request(service_url + '/companion/plans/' + plan_id + '/planning', headers={'Authorization': 'Bearer token-a'})
            with urllib.request.urlopen(req, timeout=5) as response:
                return json.load(response)

        def connected():
            end = time.monotonic() + 30
            while time.monotonic() < end:
                if planning().get('delivery', {}).get('connected'):
                    return
                time.sleep(0.2)
            raise TimeoutError('companion did not connect')
        companion = start_companion()
        connected()
        page = planning()
        batch = 'COMPANION_ANSWER_BATCH'
        body = {'contractVersion': 'v1', 'planId': plan_id, 'operationId': batch, 'expectedRevision': page['cursor']['revision'], 'expectedDigest': page['cursor']['digest'], 'entries': [{'id': 'companion-answer', 'section': 'Trial', 'kind': 'note', 'body': 'Disposable answer for the companion test.'}]}
        before = len(requests)
        start = len(b.events)
        req = urllib.request.Request(service_url + '/api/plans/' + plan_id + '/planning', data=json.dumps(body).encode(), headers={'Authorization': 'Bearer browser-a', 'Content-Type': 'application/json', 'X-Irudd-Planning': '1'}, method='POST')
        with urllib.request.urlopen(req, timeout=5) as response:
            assert response.status == 200
        b.complete(start, 40)
        assert len(requests) == before + 1
        assert batch in json.dumps(requests[-1])
        end = time.monotonic() + 10
        while planning().get('delivery', {}).get('queuedThrough') != 1 and time.monotonic() < end:
            time.sleep(0.2)
        assert planning()['delivery']['queuedThrough'] == 1
        stop_companion(companion)
        companion = start_companion()
        connected()
        time.sleep(12)
        assert len(requests) == before + 1
        stop_companion(companion)
        print('PASS saved canvas answer -> companion -> codex queue -> new turn; restart does not duplicate', flush=True)
    (root / 'result.json').write_text(json.dumps({'passed': ['idle', 'busy', 'interrupted', 'unloaded-resume'], 'model_requests': len(requests)}, indent=2))
finally:
    gate.set()
    for child, log in companions:
        stop_companion(child)
        log.close()
    for app in apps:
        app.close()
    server.shutdown()
    print('Disposable processes stopped. Evidence:', root, flush=True)
