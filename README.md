# Anime — extensiones para JiruHub

Repositorio propio de extensiones para **JiruHub** (fork de Miru).

## Cómo usarlo en la app

1. Abre JiruHub → **Ajustes → Repo URL** y pega:

   ```
   https://raw.githubusercontent.com/yeflixlite/Anime/main
   ```

2. Ve a **Extensiones → Repo**, busca **Anime Ninja** e instálala.

> Nota: la app lee el índice desde `<Repo URL>/index.json` y descarga cada
> extensión usando el campo `url` de su entrada.

## Extensiones

| Nombre | Package | Sitio | Estado |
| --- | --- | --- | --- |
| Anime Ninja | `animeninja` | animeonline.ninja | Cloudflare |

### Anime Ninja (animeninja)

- **Listado**: `/genero/animeflix/` (+ `/page/N/`)
- **Búsqueda**: `/?s=<q>`
- **Series**: `/online/<slug>/` → episodios en `#seasons`
- **Películas**: `/pelicula/<slug>/`
- **Episodios**: `/episodio/<slug>/` → servidores Dooplay
- **Video**: resuelto vía `/wp-json/dooplayer/v1/post/<POST>?type=<TYPE>&source=<NUME>`
  (con fallback `admin-ajax`), y luego se busca el `m3u8`/`mp4` real.

**Requisito Cloudflare:** el sitio tiene un challenge interactivo. Abre la web
una vez dentro del WebView de la app para obtener la cookie `cf_clearance`;
después la extensión (que comparte el cookie jar) funciona.
