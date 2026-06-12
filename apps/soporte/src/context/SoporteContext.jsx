import { createContext, useContext, useMemo, useState } from 'react';

// Contexto del modulo Soporte. Esqueleto: cuando se construya la bandeja,
// aca viven las conversaciones (wa_conversations), la suscripcion realtime
// a wa_messages y las acciones de envio via Evolution API.
const SoporteContext = createContext(null);

export function useSoporte() {
  const ctx = useContext(SoporteContext);
  if (!ctx) throw new Error('useSoporte must be used within SoporteProvider');
  return ctx;
}

export function SoporteProvider({ children }) {
  const [conversations] = useState([]);
  const [loading] = useState(false);

  const value = useMemo(() => ({
    conversations,
    loading,
  }), [conversations, loading]);

  return <SoporteContext.Provider value={value}>{children}</SoporteContext.Provider>;
}
