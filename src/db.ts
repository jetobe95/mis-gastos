import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

// 1. Definimos la estructura de un Gasto
export interface Gasto {
  id?: number;          // Opcional porque IndexedDB lo autogenera
  concepto: string;
  monto: number;
  fecha?: string;
}

// 2. Definimos el esquema de la base de datos
interface GastosDB extends DBSchema {
  'cola-gastos': {
    key: number;
    value: Gasto;
  };
}

// 3. Inicializamos la base de datos
const dbPromise: Promise<IDBPDatabase<GastosDB>> = openDB<GastosDB>('GastosDB', 1, {
  upgrade(db) {
    db.createObjectStore('cola-gastos', { 
      keyPath: 'id', 
      autoIncrement: true 
    });
  },
});

// 4. Funciones del motor de sincronización
export const guardarGastoLocal = async (gasto: Gasto): Promise<number> => {
  const db = await dbPromise;
  // Añadimos la fecha si no viene
  const nuevoGasto = { ...gasto, fecha: gasto.fecha || new Date().toISOString() };
  return db.add('cola-gastos', nuevoGasto);
};

export const obtenerGastosPendientes = async (): Promise<Gasto[]> => {
  const db = await dbPromise;
  return db.getAll('cola-gastos');
};

export const borrarGastoDeCola = async (id: number): Promise<void> => {
  const db = await dbPromise;
  return db.delete('cola-gastos', id);
};