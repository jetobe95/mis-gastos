import React, { useState, useEffect, useCallback } from 'react';
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

/**
 * CONFIGURACIÓN DE TIPOS Y BASE DE DATOS
 */

export interface Gasto {
  id?: number;
  concepto: string;
  monto: number;
  fecha: string;
}

interface GastosDB extends DBSchema {
  'cola-gastos': {
    key: number;
    value: Gasto;
  };
}

const DB_NAME = 'GastosOfflineDB';

// Inicialización de la base de datos IndexedDB
const initDB = async (): Promise<IDBPDatabase<GastosDB>> => {
  return openDB<GastosDB>(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('cola-gastos')) {
        db.createObjectStore('cola-gastos', { 
          keyPath: 'id', 
          autoIncrement: true 
        });
      }
    },
  });
};

/**
 * FUNCIONES DEL MOTOR DE SINCRONIZACIÓN
 */

const guardarGastoLocal = async (gasto: Omit<Gasto, 'id'>): Promise<number> => {
  const db = await initDB();
  return db.add('cola-gastos', {
    ...gasto,
    fecha: new Date().toISOString()
  });
};

const obtenerGastosPendientes = async (): Promise<Gasto[]> => {
  const db = await initDB();
  return db.getAll('cola-gastos');
};

const borrarGastoDeCola = async (id: number): Promise<void> => {
  const db = await initDB();
  return db.delete('cola-gastos', id);
};

/**
 * COMPONENTE PRINCIPAL
 */

// REEMPLAZA ESTO CON TU URL DE GOOGLE APPS SCRIPT
const GOOGLE_SHEETS_ENDPOINT = 'TU_URL_DE_GOOGLE_SHEETS_AQUÍ';

const App: React.FC = () => {
  const [concepto, setConcepto] = useState('');
  const [monto, setMonto] = useState('');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [sincronizando, setSincronizando] = useState(false);
  const [pendientesCount, setPendientesCount] = useState(0);

  // Función para enviar datos a Google Sheets
  const enviarASheets = useCallback(async () => {
    if (!navigator.onLine || sincronizando) return;

    const pendientes = await obtenerGastosPendientes();
    if (pendientes.length === 0) {
      setPendientesCount(0);
      return;
    }

    setSincronizando(true);

    for (const gasto of pendientes) {
      try {
        // Usamos mode: 'no-cors' para evitar bloqueos de Google Apps Script
        await fetch(GOOGLE_SHEETS_ENDPOINT, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(gasto),
        });

        // Al usar no-cors asumimos éxito si no hay excepción
        if (gasto.id) await borrarGastoDeCola(gasto.id);
      } catch (error) {
        console.error("Error al sincronizar:", error);
        break; 
      }
    }

    const restantes = await obtenerGastosPendientes();
    setPendientesCount(restantes.length);
    setSincronizando(false);
  }, [sincronizando]);

  // Monitorear estado de red y sincronizar
  useEffect(() => {
    const handleStatusChange = () => {
      setIsOnline(navigator.onLine);
      if (navigator.onLine) enviarASheets();
    };

    window.addEventListener('online', handleStatusChange);
    window.addEventListener('offline', handleStatusChange);
    
    // Verificación inicial de gastos en la cola
    obtenerGastosPendientes().then(list => setPendientesCount(list.length));
    
    return () => {
      window.removeEventListener('online', handleStatusChange);
      window.removeEventListener('offline', handleStatusChange);
    };
  }, [enviarASheets]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!concepto || !monto) return;

    const nuevoGasto = {
      concepto,
      monto: parseFloat(monto),
      fecha: new Date().toISOString()
    };

    // Guardar siempre localmente primero (Offline First)
    await guardarGastoLocal(nuevoGasto);
    
    setConcepto('');
    setMonto('');
    
    // Actualizar vista e intentar subir
    const pendientes = await obtenerGastosPendientes();
    setPendientesCount(pendientes.length);
    enviarASheets();
  };

  return (
    <div className="min-h-screen bg-[#f2f2f7] flex flex-col items-center p-6 font-[-apple-system,BlinkMacSystemFont,sans-serif]">
      {/* Estilo tipo iOS */}
      <header className="w-full max-w-md mb-8 flex justify-between items-end pt-10">
        <div>
          <p className="text-gray-500 text-sm font-semibold uppercase tracking-wider">Mi Cartera</p>
          <h1 className="text-4xl font-extrabold text-black">Gastos</h1>
        </div>
        <div className={`px-3 py-1 rounded-full text-xs font-bold ${isOnline ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>
          {isOnline ? 'ONLINE' : 'OFFLINE'}
        </div>
      </header>

      <main className="w-full max-w-md space-y-6">
        <section className="bg-white rounded-3xl shadow-sm p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase mb-1 ml-1">¿En qué gastaste?</label>
              <input
                type="text"
                value={concepto}
                onChange={(e) => setConcepto(e.target.value)}
                placeholder="Ej. Café, Cena, Uber..."
                className="w-full p-4 bg-gray-100 rounded-2xl border-none focus:ring-2 focus:ring-blue-500 text-lg"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase mb-1 ml-1">Monto</label>
              <input
                type="number"
                step="0.01"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                placeholder="0.00"
                className="w-full p-4 bg-gray-100 rounded-2xl border-none focus:ring-2 focus:ring-blue-500 text-lg font-mono"
                required
              />
            </div>
            <button
              type="submit"
              className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold text-lg shadow-blue-200 shadow-lg active:scale-[0.98] transition-all"
            >
              Registrar Gasto
            </button>
          </form>
        </section>

        {pendientesCount > 0 && (
          <div className="bg-white rounded-3xl p-5 flex items-center justify-between shadow-sm border-l-4 border-orange-400">
            <div>
              <p className="text-orange-800 font-bold text-sm">Sincronización pendiente</p>
              <p className="text-orange-600 text-xs">{pendientesCount} registros en cola local</p>
            </div>
            {sincronizando ? (
              <div className="animate-spin h-5 w-5 border-2 border-orange-500 border-t-transparent rounded-full"></div>
            ) : (
              <span className="text-orange-400 text-xl">⏳</span>
            )}
          </div>
        )}
      </main>

      <footer className="mt-auto text-gray-400 text-xs text-center py-6 leading-relaxed">
        Los datos se guardan localmente y se suben <br />
        automáticamente al detectar conexión.
      </footer>
    </div>
  );
};

export default App;