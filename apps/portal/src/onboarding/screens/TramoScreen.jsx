// Portada de tramo: qué se pregunta acá, para qué sirve y cuánto tarda.
//
// NO hay pantalla de cierre de tramo. Antes existía una celebración al terminar
// cada uno ("Tu historia, listo · 23%") y se sacó: el anillo de progreso del
// header ya se mueve con cada respuesta, así que esa pantalla le contaba al
// cliente algo que acababa de ver, a cambio de un toque más y de romper el
// ritmo justo cuando lo tenía agarrado. Del último tramo se sale al repaso.
//
// Lo que sí se conserva es la CONSECUENCIA CONCRETA ("con esto ya podemos
// escribir tu video de ventas"): el refuerzo tiene que ser información, no
// palmadita. Ahora va en la portada, antes de arrancar, que es donde sirve para
// decidir invertir los minutos.
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { IcoArrowR, IcoPlay } from '../../components/icons';
import { TO, F, dsp, btn, btnTexto, label } from '../tokens';
import { useOnboarding } from '../OnboardingProvider';
import { OnbShell, OnbHeader, OnbFooter } from '../components/OnbShell';
import { pantallasDe, tramoCompleto } from '../progreso';

export default function TramoScreen() {
  const { tramo } = useParams();
  const navigate = useNavigate();

  const { secciones, tramos, respuestas, bloqueantes, flush } = useOnboarding();
  const seccion = secciones.find((s) => s.skey === tramo);
  if (!seccion) return null;

  const i = tramos.findIndex((s) => s.skey === tramo);
  const pantallas = pantallasDe(seccion, respuestas);
  const completo = tramoCompleto(seccion, respuestas, bloqueantes);
  const primera = pantallas[0];
  const requeridas = (seccion.preguntas || []).filter((q) => q.requerida).length;

  const ir = async (destino) => { await flush(); navigate(destino); };

  return (
    <OnbShell>
      <OnbHeader titulo={`Tramo ${i + 1} de ${tramos.length}`} onVolver={() => navigate('/onboarding')} />

      <div className="kxs" style={{ flex: 1, paddingTop: 28, paddingBottom: 30 }}>
        <div style={{ ...label(TO.blue), marginBottom: 11 }}>
          {completo ? 'Ya lo completaste' : `Unos ${seccion.minutos} minutos`}
        </div>

        <div style={{ ...dsp(F.h1, '-0.035em'), lineHeight: 1.12 }}>{seccion.titulo}</div>

        {seccion.subtitulo && (
          <div style={{ fontSize: F.body, lineHeight: 1.55, color: TO.body, marginTop: 13, textWrap: 'pretty' }}>
            {seccion.subtitulo}
          </div>
        )}

        {/* El video se renderiza solo si existe: al lanzar todavía no están
            grabados, y un marco vacío se ve peor que ningún video. */}
        {seccion.video && <VideoTramo url={seccion.video} />}

        {seccion.promesa && (
          <div style={{
            marginTop: 22, padding: '16px 18px', borderRadius: 16,
            background: TO.blueWash, border: `1px solid ${TO.blueLine}`,
          }}>
            <div style={{ ...label(TO.blue), marginBottom: 7 }}>Para qué sirve</div>
            <div style={{ fontSize: F.sub, lineHeight: 1.55, color: TO.body }}>{seccion.promesa}</div>
          </div>
        )}

        {seccion.intro && (
          <div style={{ fontSize: F.sub, lineHeight: 1.6, color: TO.body, marginTop: 20, whiteSpace: 'pre-wrap' }}>
            {seccion.intro}
          </div>
        )}

        <div style={{
          fontSize: F.meta, fontWeight: 600, color: TO.meta, marginTop: 22,
          paddingTop: 18, borderTop: `1px solid ${TO.line}`,
        }}>
          {pantallas.length} {pantallas.length === 1 ? 'pantalla' : 'pantallas'}
          {requeridas > 0 && ` · ${requeridas} ${requeridas === 1 ? 'pregunta' : 'preguntas'}`}
          {' · se guarda solo'}
        </div>
      </div>

      <OnbFooter>
        <button
          type="button"
          onClick={() => primera && ir(`/onboarding/${tramo}/${primera.id}`)}
          style={btn(completo ? TO.ink : TO.blueBtn)}
        >
          {completo ? 'REVISAR MIS RESPUESTAS' : 'EMPEZAR'}
          <IcoArrowR size={18} stroke="#fff" sw={2.4} />
        </button>

        {/* Dar permiso explícito de parar BAJA el abandono: elimina la sensación
            de estar atrapado en un formulario que no termina más. Vive acá
            porque la portada es el único punto de respiro que quedó entre
            tramos. */}
        {seccion.checkpoint && (
          <button type="button" onClick={() => ir('/')} style={btnTexto}>
            Continuar más tarde
          </button>
        )}
      </OnbFooter>
    </OnbShell>
  );
}

function VideoTramo({ url }) {
  const [play, setPlay] = useState(false);
  return (
    <div style={{
      marginTop: 22, position: 'relative', width: '100%', aspectRatio: '16 / 9',
      borderRadius: 18, overflow: 'hidden', background: '#DDE2EA',
    }}>
      {play ? (
        <iframe
          src={`${url}${url.includes('?') ? '&' : '?'}autoplay=true`}
          title="Cómo completar este tramo"
          allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          style={{ width: '100%', height: '100%', border: 0 }}
        />
      ) : (
        // Nunca autoplay: mucha gente entra desde el celular con datos móviles.
        <button type="button" onClick={() => setPlay(true)} style={{
          position: 'absolute', inset: 0, border: 'none', cursor: 'pointer',
          background: 'linear-gradient(135deg,#E4EBFF,#DDE2EA)',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', gap: 12,
        }}>
          <span style={{
            width: 62, height: 62, borderRadius: '50%', background: TO.blueBtn,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 8px 22px rgba(74,103,216,.3)',
          }}><IcoPlay size={26} /></span>
          <span style={{ fontSize: 16, fontWeight: 800, color: TO.ink }}>
            Mirá el video (menos de 1 minuto)
          </span>
        </button>
      )}
    </div>
  );
}
