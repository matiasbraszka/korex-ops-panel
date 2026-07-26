import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { usePortalAuth } from './auth/PortalAuthProvider';
import Layout from './components/Layout';
import PhoneFrame from './components/PhoneFrame';
import ErrorBoundary from './components/ErrorBoundary';
import { Loading } from './components/ui';
import LoginScreen from './screens/LoginScreen';
import InicioScreen from './screens/InicioScreen';
import GuionesTabScreen from './screens/GuionesTabScreen';
import DocumentoScreen from './screens/DocumentoScreen';
import EmbudosScreen from './screens/EmbudosScreen';
import EmbudoScreen from './screens/EmbudoScreen';
import EntregablesScreen from './screens/EntregablesScreen';
import MaterialScreen from './screens/MaterialScreen';
import SubirPedidoScreen from './screens/SubirPedidoScreen';
import AccesoMetaScreen from './screens/AccesoMetaScreen';
import { OnboardingProvider } from './onboarding/OnboardingProvider';
import BarraDemo from './onboarding/components/BarraDemo';
import { DEMO_DISPONIBLE } from './onboarding/demo';
import BienvenidaScreen from './onboarding/screens/BienvenidaScreen';
import AvanceScreen from './onboarding/screens/AvanceScreen';
import PasoScreen from './onboarding/screens/PasoScreen';
import ListoScreen from './onboarding/screens/ListoScreen';

export default function App() {
  const { authed, loading } = usePortalAuth();

  if (loading) {
    return <PhoneFrame><div style={{ margin: 'auto' }}><Loading label="Abriendo tu espacio…" /></div></PhoneFrame>;
  }

  if (!authed) {
    return (
      <Routes>
        <Route path="/login" element={<LoginScreen />} />
        {/* El onboarding en MODO PRUEBA, sin cuenta.
            Sin esto, la única forma de mirarlo era entrar con las credenciales
            de un cliente real — es decir, mirando SUS respuestas. Acá el
            catálogo sale de una copia local y nada se guarda en ningún lado.
            `DEMO_DISPONIBLE` es false en el build de producción, así que este
            bloque no existe fuera de desarrollo. */}
        {DEMO_DISPONIBLE && (
          <Route path="/onboarding" element={<OnboardingProvider><BarraDemo /><Outlet /></OnboardingProvider>}>
            <Route index element={<BienvenidaScreen />} />
            <Route path="avance" element={<AvanceScreen />} />
            <Route path="listo" element={<ListoScreen />} />
            <Route path=":paso" element={<PasoScreen />} />
            <Route path=":paso/:pantalla" element={<PasoScreen />} />
          </Route>
        )}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/login" element={<Navigate to="/" replace />} />

        {/* Onboarding: pantalla completa con su propia barra lateral, SIN los
            tabs del portal, para que el cliente no se distraiga. Es donde cae
            el magic link del mail.
            Va FUERA de <PhoneFrame>: el onboarding ocupa el ancho real del
            navegador (240px de barra lateral + 760px de contenido), que es
            justamente lo que el marco de teléfono impide.
            Su Provider envuelve solo estas rutas: el resto del portal no
            necesita cargar el catálogo de 125 preguntas.
            Las rutas literales van ANTES que :paso, o se las come el dinámico. */}
        <Route path="/onboarding" element={<OnboardingProvider><BarraDemo /><Outlet /></OnboardingProvider>}>
          <Route index element={<BienvenidaScreen />} />
          <Route path="avance" element={<AvanceScreen />} />
          <Route path="listo" element={<ListoScreen />} />
          <Route path=":paso" element={<PasoScreen />} />
          <Route path=":paso/:pantalla" element={<PasoScreen />} />
        </Route>

        {/* Tabs con navegación inferior (menú lateral en PC): Inicio · Guiones · Embudos · Material */}
        <Route element={<Layout />}>
          <Route path="/" element={<InicioScreen />} />
          <Route path="/embudos" element={<EmbudosScreen />} />
          <Route path="/material" element={<MaterialScreen />} />
        </Route>
        {/* Guiones: bienvenida la primera vez; después va DIRECTO al documento */}
        <Route path="/guiones" element={<GuionesTabScreen />} />
        {/* Pantallas inmersivas (con "Volver") */}
        <Route path="/documento/:sid/:tipo" element={<DocumentoScreen />} />
        <Route path="/embudo/:id" element={<EmbudoScreen />} />
        <Route path="/entregables/:id" element={<EntregablesScreen />} />
        <Route path="/pedido/:id" element={<SubirPedidoScreen />} />
        <Route path="/meta" element={<AccesoMetaScreen />} />
        {/* Rutas del portal viejo → sus equivalentes nuevas */}
        <Route path="/funnels" element={<Navigate to="/embudos" replace />} />
        <Route path="/avance" element={<Navigate to="/embudos" replace />} />
        <Route path="/recursos" element={<Navigate to="/material" replace />} />
        <Route path="/perfil" element={<Navigate to="/" replace />} />
        <Route path="/funnel/:id" element={<Navigate to="/embudos" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ErrorBoundary>
  );
}
