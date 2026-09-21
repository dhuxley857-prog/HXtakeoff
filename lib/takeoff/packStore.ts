import type { SourceDocument } from "../../app/components/PdfCanvas";

type StoredPackFile = {
  id: string;
  revision: number;
  order: number;
  name: string;
  lastModified: number;
  blob: Blob;
};

const DB_NAME = "hx-takeoff-packs";
const STORE_NAME = "revision-files";

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME))
        database.createObjectStore(STORE_NAME, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveRevisionPack(files: File[], revision: number) {
  if (typeof indexedDB === "undefined") return;
  const database = await openDatabase(),
    transaction = database.transaction(STORE_NAME, "readwrite"),
    store = transaction.objectStore(STORE_NAME),
    existing = (await requestResult(store.getAll())) as StoredPackFile[];
  existing
    .filter((entry) => entry.revision === revision)
    .forEach((entry) => store.delete(entry.id));
  files.forEach((file, order) =>
    store.put({
      id: `${revision}:${order}`,
      revision,
      order,
      name: file.name,
      lastModified: file.lastModified,
      blob: file,
    } satisfies StoredPackFile),
  );
  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
  database.close();
}

export async function loadRevisionPack(revision: number) {
  if (typeof indexedDB === "undefined") return [] as SourceDocument[];
  const database = await openDatabase(),
    transaction = database.transaction(STORE_NAME, "readonly"),
    rows = (await requestResult(
      transaction.objectStore(STORE_NAME).getAll(),
    )) as StoredPackFile[];
  database.close();
  return rows
    .filter((entry) => entry.revision === revision)
    .sort((a, b) => a.order - b.order)
    .map((entry) => ({
      name: entry.name,
      url: URL.createObjectURL(entry.blob),
      revision: `Rev ${revision}`,
    }));
}
