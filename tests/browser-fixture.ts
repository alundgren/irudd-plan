import type {
  AssetDescriptor,
  UploadAssetRequest,
} from "../src/contract/plan.js";
import { fixtureAssetUpload, tenItemPlan } from "./fixture.js";

export function browserAssetUploads(planId: string): UploadAssetRequest[] {
  return [
    fixtureAssetUpload(planId),
    {
      contractVersion: "v1",
      planId,
      assetId: "asset-image",
      mediaType: "image/png",
      caption: "A small reference image",
      role: "illustration",
      bytesBase64:
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z2S8AAAAASUVORK5CYII=",
    },
    {
      contractVersion: "v1",
      planId,
      assetId: "asset-mockup",
      mediaType: "text/html",
      caption: "Interactive review control",
      role: "binding-reference",
      bytesBase64: Buffer.from(`
        <style>body{font:16px system-ui;padding:2rem;background:#f8fafc}button{padding:.6rem 1rem}</style>
        <button id="counter">Reviewed 0 times</button>
        <p id="security">Checking isolation</p>
        <script>
          let count = 0;
          document.querySelector('#counter').onclick = () => {
            count += 1;
            document.querySelector('#counter').textContent = 'Reviewed ' + count + ' time';
          };
          document.querySelector('#thrower').onclick = () => { throw new Error('expected click failure'); };
          try { window.parent.localStorage.getItem('private'); document.body.dataset.storage = 'read'; }
          catch { document.body.dataset.storage = 'blocked'; }
          fetch('/api/plans').then(() => document.body.dataset.network = 'sent').catch(() => document.body.dataset.network = 'blocked');
          try { window.top.location = '/escaped'; } catch {}
          try { window.location.href = '/frame-escaped'; } catch {}
          setTimeout(function () {
            try { globalThis.indexedDB.open('timer-leak'); document.body.dataset.timerStorage = 'read'; }
            catch { document.body.dataset.timerStorage = 'blocked'; }
            try {
              globalThis.fetch('/api/plans')
                .then(() => document.body.dataset.timerNetwork = 'sent')
                .catch(() => document.body.dataset.timerNetwork = 'blocked');
            } catch { document.body.dataset.timerNetwork = 'blocked'; }
          }, 0);
          setTimeout(() => document.querySelector('#security').textContent = 'Isolation active', 50);
        </script>
        <button id="thrower">Fail one interaction</button>
        <script>
          const imports = ["/api/plans", "https://tracker.example/module.js"];
          Promise.all(imports.map((specifier) => {
            try { return Function('value', 'return import(value)')(specifier); }
            catch { return Promise.reject(new Error('blocked')); }
          }));
        </script>
        <script>
          try { indexedDB.open('private'); document.body.dataset.indexedDb = 'read'; }
          catch { document.body.dataset.indexedDb = 'blocked'; }
          try { navigator.storage.getDirectory(); document.body.dataset.storageApi = 'read'; }
          catch { document.body.dataset.storageApi = 'blocked'; }
          try { new BroadcastChannel('private'); document.body.dataset.broadcast = 'open'; }
          catch { document.body.dataset.broadcast = 'blocked'; }
        </script>
      `).toString("base64"),
      source: {
        mediaType: "text/plain",
        bytesBase64: Buffer.from("editable mockup source").toString("base64"),
      },
    },
  ];
}

export function makeBrowserPlan(
  assets: ReadonlyArray<AssetDescriptor>,
  planId = "browser-plan",
) {
  const base = tenItemPlan(planId);
  return {
    ...base,
    epicGoal:
      "Review a complete delivery plan without losing the current conversation or reading position.",
    assets,
    decisions: base.decisions.map((decision) =>
      decision.id === "decision-database"
        ? { ...decision, assetIds: ["asset-mockup"] }
        : decision,
    ),
    items: base.items.map((item, index) => ({
      ...item,
      goal: `${item.goal}. This intentionally longer explanation gives the sheet enough prose to exercise a realistic reading position while requirements change in the background.`,
      requirements: [
        ...item.requirements,
        "Keep the current committed requirements readable and selectable.",
        "Do not add editing or publication controls to the review canvas.",
      ],
      requiredAssetIds: index === 0 ? ["asset-image"] : [],
    })),
  };
}
