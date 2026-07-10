# Fuentes de marca — súbelas aquí

Esta carpeta se sirve como estático en la ruta **`/fonts/…`**. Los `@font-face`
ya están cableados en `app/styles/samorai/fonts.css`; en cuanto dejes los
archivos aquí (y hagas commit), la tipografía real entra sola — sin tocar CSS.

## Archivos esperados (nómbralos EXACTAMENTE así)

### Bank Gothic (titulares · `--font-display`)
| Peso | Archivo |
|---|---|
| Regular (400) | `BankGothic-Regular.woff2` (o `.ttf`) |
| Medium (500)  | `BankGothic-Medium.woff2`  (o `.ttf`) |
| Bold (700)    | `BankGothic-Bold.woff2`    (o `.ttf`) |

### Sloop Script (claims editoriales · `--font-script`) — opcional
| Peso | Archivo |
|---|---|
| Regular (400) | `SloopScript.woff2` (o `.ttf`) |

## Formato
- **Recomendado: `.woff2`** (el más ligero para web). Convierte gratis en
  <https://transfonter.org> o <https://cloudconvert.com> si solo tienes `.ttf`/`.otf`.
- También se acepta **`.ttf`**: el `@font-face` lo prueba si no encuentra el `.woff2`.

## Notas
- Si solo tienes **un peso** de Bank Gothic, súbelo como `BankGothic-Medium`;
  los pesos que falten caerán al fallback **Saira** (no rompe nada).
- Mientras no haya archivos, la web usa los fallbacks **Saira** / **Pinyon Script**.
- Recuerda hacer **commit** de los archivos: Vercel sirve lo que está en el repo.
