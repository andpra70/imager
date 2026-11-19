export interface StoredKleinStylePreview {
  styleId: string;
  image: Blob;
  generatedAt: number;
}

const DATABASE_NAME = "plotterfun-style-previews";
const DATABASE_VERSION = 1;
const STORE_NAME = "previews";

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME, { keyPath: "styleId" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Impossibile aprire la cache locale degli stili."));
  });
}

export async function loadStoredKleinStylePreviews() {
  const database = await openDatabase();
  try {
    return await new Promise<StoredKleinStylePreview[]>((resolve, reject) => {
      const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve(request.result as StoredKleinStylePreview[]);
      request.onerror = () => reject(request.error ?? new Error("Impossibile leggere la cache locale degli stili."));
    });
  } finally { database.close(); }
}

export async function storeKleinStylePreview(value: StoredKleinStylePreview) {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(value);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Impossibile salvare la preview dello stile."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Salvataggio della preview annullato."));
    });
  } finally { database.close(); }
}
