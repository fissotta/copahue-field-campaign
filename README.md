# Copahue Field Campaign — v8.17

Prototipo en primera persona de una campaña de terreno en Copahue–Caviahue
(Neuquén, Argentina): muestreo de aguas, filtración de membranas y sonda
multiparamétrica sobre un terreno 3D con datos científicos reales.

## ▶️ Jugar online

**https://fissotta.github.io/copahue-field-campaign/**

Se recomienda Chrome, Edge o Safari en computador de escritorio (usa WebGL2).
Haz clic en el juego para capturar el mouse y mirar alrededor; `Esc` lo suelta.

## Controles rápidos

| Tecla | Acción |
|---|---|
| `W A S D` | Caminar / conducir |
| Mouse | Mirar |
| `Espacio` | Saltar (a pie) |
| `V` | Primera / tercera persona |
| `M` | Vista de mapa |
| `O` o 🎬 | Alternar look realista / cómic |
| `R` | Cambiar membrana (filtración) |
| `F` | Vaciar el Kitasato |
| `E` / `Enter` | Confirmar |

## Correrlo local

```bash
python3 -m http.server 8000
# luego abre http://localhost:8000
```

Tiene que servirse por HTTP, no abriendo `index.html` como archivo.

## Estructura

- `index.html` — pantalla y estilos
- `libs/` — three.js y addons
- `data/data.js` — datos científicos (muestras, metagenomas, DEM, fotos)
- `js/world.js` — mapa y terreno
- `js/game.js` — lógica del juego y cámaras
- `js/real.js` — modo de render realista (PBR, HDR, post-proceso)
- `js/fpgear.js` — equipo de terreno en primera persona
- `js/fpworld.js` — vegetación y fauna alrededor del jugador

El detalle completo de versiones y novedades está en [LEEME.md](LEEME.md).
