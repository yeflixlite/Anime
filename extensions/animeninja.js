// ==MiruExtension==
// @name         Anime Ninja
// @version      v0.3.0
// @author       YeaniFlix
// @lang         es
// @license      MIT
// @package      animeninja
// @type         bangumi
// @icon         https://ver.animeonline.ninja/favicon.ico
// @webSite      https://ver.animeonline.ninja
// @nsfw         false
// ==/MiruExtension==

// AnimeOnline Ninja (WordPress + tema Dooplay).
//
//   Listado por genero : /genero/animeflix/  (+ /page/N/)
//   Busqueda           : /?s=<q>
//   Detalle serie      : /online/<slug>/    -> lista de episodios (#seasons)
//   Detalle pelicula   : /pelicula/<slug>/  -> reproductor en la misma pagina
//   Episodio           : /episodio/<slug>/  -> servidores (#playeroptionsul li.dooplay_player_option)
//
// El video NO esta en el HTML: Dooplay lo resuelve por AJAX contra
//   /wp-json/dooplayer/v1/post/<POST>?type=<TYPE>&source=<NUME>
// usando los data-post / data-nume / data-type de cada servidor.
//
// IMPORTANTE (Cloudflare): el dominio actual es ver.animeonline.ninja y esta
// detras de un challenge INTERACTIVO (Cf-Mitigated: challenge, "Just a moment").
// Ninguna peticion normal puede pasar: hace falta la cookie cf_clearance que
// solo se obtiene resolviendo el reto en un navegador real.
//
// Como pasar el reto en la app (una sola vez):
//   1. La extension devuelve un item "PASO 1: verificar Cloudflare".
//   2. Abre ese item -> pantalla de detalle (aunque salga el aviso).
//   3. Toca el icono GLOBO (arriba a la derecha) -> se abre el WebView.
//   4. Espera a que cargue del todo el sitio (se resuelve el reto).
//   5. Vuelve atras: la app copia las cookies (cf_clearance) al jar.
//   6. Refresca: ya cargara el contenido normalmente.
// El UA del WebView y el de las peticiones es el mismo, asi que la cookie vale.

const SITE = "https://ver.animeonline.ninja";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export default class extends Extension {
  async latest(page) {
    try {
      const p = Math.max(1, parseInt(page) || 1);
      const path = p === 1 ? "/genero/animeflix/" : "/genero/animeflix/page/" + p + "/";
      const res = await this.request(path, { headers: this.reqHeaders(SITE) });
      const list = await this.parseList(res);
      return list.length ? list : this.bootstrapList();
    } catch (_) {
      return this.bootstrapList();
    }
  }

  async search(kw, page) {
    try {
      const q = encodeURIComponent(((kw || "") + "").trim());
      const p = Math.max(1, parseInt(page) || 1);
      const path = p === 1 ? "/?s=" + q : "/?s=" + q + "&paged=" + p;
      const res = await this.request(path, { headers: this.reqHeaders(SITE) });
      const list = await this.parseList(res);
      return list.length ? list : this.bootstrapList();
    } catch (_) {
      return this.bootstrapList();
    }
  }

  async createFilter() {
    return [];
  }

  // ------------------------------------------------------------------ listas
  async parseList(res) {
    if (!res || typeof res !== "string") return [];
    const out = [];
    let items = [];
    try {
      items = await this.querySelectorAll(res, "article.item");
    } catch (_) {
      items = [];
    }
    for (const el of items) {
      const html = el.content;
      let url = await this.getAttributeText(html, "div.data h3 a", "href");
      if (!url) url = await this.getAttributeText(html, "div.poster a", "href");
      if (!url) continue;

      let title = "";
      try {
        title = ((await this.querySelector(html, "div.data h3 a").text) || "").trim();
      } catch (_) {}
      if (!title) title = (await this.getAttributeText(html, "div.poster img", "alt")) || "";

      let cover = await this.getAttributeText(html, "div.poster img", "data-src");
      if (!cover) cover = await this.getAttributeText(html, "div.poster img", "src");

      let update = "";
      try {
        update = ((await this.querySelector(html, "div.data span").text) || "").trim();
      } catch (_) {}

      if (title) out.push({ title: title.trim(), url: url, cover: cover || "", update: update });
    }
    return out;
  }

  // ------------------------------------------------------------------ helpers
  // Cabeceras de navegador (el motor añade UA y cookies del jar automaticamente).
  reqHeaders(ref) {
    return {
      "Miru-Url": ref,
      "Referer": ref,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
    };
  }

  // Normaliza cualquier url a absoluta del sitio.
  norm(url) {
    if (!url) return SITE + "/";
    if (/^https?:/i.test(url)) return url;
    if (url.indexOf("//") === 0) return "https:" + url;
    return SITE + (url.charAt(0) === "/" ? "" : "/") + url;
  }

  // Un solo item para abrir el sitio en el WebView (icono globo) y pasar Cloudflare.
  bootstrapList() {
    return [{
      title: "PASO 1: verificar Cloudflare (toca aqui)",
      url: "/",
      cover: "",
      update: "Luego toca el icono GLOBO arriba, espera y vuelve",
    }];
  }

  blockedDetail(url) {
    return {
      title: "Anime Ninja",
      cover: "",
      desc:
        "El sitio bloqueo la peticion (Cloudflare: 403 'Just a moment'). " +
        "Solucion: toca el icono GLOBO (arriba a la derecha), espera a que " +
        "cargue del todo la pagina del sitio y vuelve. Despues cargara normal.",
      episodes: [{ title: "Ver", urls: [{ name: "Reproducir", url: this.norm(url) }] }],
    };
  }

  // ------------------------------------------------------------------ detalle
  async detail(url) {
    const full = this.norm(url);
    let res = "";
    try {
      res = await this.request("", { headers: this.reqHeaders(full) });
    } catch (_) {
      res = "";
    }
    if (!res || typeof res !== "string" || res.length < 200) {
      return this.blockedDetail(url);
    }

    // Titulo: en Dooplay el <h1> real no lleva clase (los "Ver Anime" llevan class).
    let title = "";
    try {
      const hs = await this.querySelectorAll(res, "h1");
      for (const h of hs) {
        if (!/class=/i.test(h.content)) {
          title = h.content.replace(/<[^>]+>/g, "").trim();
          if (title) break;
        }
      }
    } catch (_) {}
    if (!title) title = this.meta(res, "og:title");

    let cover = this.meta(res, "og:image");
    if (!cover) cover = await this.getAttributeText(res, "div.poster img", "data-src");
    if (!cover) cover = await this.getAttributeText(res, "div.poster img", "src");
    cover = (cover || "").trim();

    let desc = "";
    try {
      desc = ((await this.querySelector(res, "div.wp-content").text) || "").replace(/\s+/g, " ").trim();
    } catch (_) {}

    // Episodios de serie
    const episodes = [];
    try {
      const eps = await this.querySelectorAll(res, "#seasons ul.episodios li");
      for (const li of eps) {
        const html = li.content;
        const epUrl = await this.getAttributeText(html, "div.episodiotitle a", "href");
        if (!epUrl) continue;
        let epName = "";
        try {
          epName = ((await this.querySelector(html, "div.episodiotitle a").text) || "").trim();
        } catch (_) {}
        if (!epName) epName = "Episodio " + (episodes.length + 1);
        episodes.push({ name: epName, url: epUrl });
      }
    } catch (_) {}

    const groups = [];
    if (episodes.length > 0) {
      groups.push({ title: "Episodios", urls: episodes });
    } else {
      // Pelicula / item de un solo reproductor: watch() resuelve los servidores.
      groups.push({ title: "Ver", urls: [{ name: "Reproducir", url: full }] });
    }

    return { title: (title || "").trim(), cover: cover || "", desc: desc, episodes: groups };
  }

  // ------------------------------------------------------------------ watch
  async watch(url) {
    try {
      const res = await this.request("", {
        headers: { "Miru-Url": url, "Referer": url },
      });
      if (!res || typeof res !== "string") {
        return { type: "hls", url: "" };
      }

      const host = (url.match(/^https?:\/\/[^\/]+/) || [SITE])[0];
      const cfg = this.dtConfig(res, host);

      // 1) Servidores declarados por Dooplay (wp-json / admin-ajax)
      const opts = await this.playerOptions(res);
      let fallback = null;
      for (const opt of opts) {
        const embed = await this.fetchEmbed(host, url, opt, cfg);
        if (!embed) continue;
        const s = await this.resolveStream(embed, url);
        if (!s) continue;
        if (!fallback) fallback = s;
        if (s.resolved) return this.stream(s);
      }
      if (fallback) return this.stream(fallback);

      // 2) Iframe suelto en la pagina
      const fr = res.match(/<iframe[^>]+src=["']([^"']+)["']/i);
      if (fr) {
        const s = await this.resolveStream(fr[1], url);
        if (s) return this.stream(s);
      }

      // 3) m3u8/mp4 suelto en el HTML de la pagina
      const inline = this.findStreamUrl(res, url);
      if (inline) return this.stream(inline);

      return { type: "hls", url: "" };
    } catch (_) {
      return { type: "hls", url: "" };
    }
  }

  // Resuelve el embed de un servidor: API JSON de Dooplay y, si falla,
  // el clasico admin-ajax (action=doo_player_ajax). Usa el url_api/url reales
  // del objeto dtAjax de la pagina (que puede apuntar a otro host, p.ej. www1).
  async fetchEmbed(host, referer, opt, cfg) {
    cfg = cfg || {};
    const apiBase = cfg.api || host + "/wp-json/dooplayer/v1/post/";
    const ajaxUrl = cfg.ajax || host + "/wp-admin/admin-ajax.php";

    const tryJson = async () => {
      try {
        const api =
          apiBase + opt.post +
          "?type=" + encodeURIComponent(opt.type) +
          "&source=" + encodeURIComponent(opt.nume);
        const data = await this.request("", { headers: { "Miru-Url": api, "Referer": referer } });
        return this.pickEmbed(data);
      } catch (_) { return ""; }
    };

    const tryAjax = async () => {
      try {
        const body =
          "action=doo_player_ajax&post=" + encodeURIComponent(opt.post) +
          "&nume=" + encodeURIComponent(opt.nume) +
          "&type=" + encodeURIComponent(opt.type);
        const data = await this.request("", {
          method: "post",
          headers: {
            "Miru-Url": ajaxUrl,
            "Referer": referer,
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          },
          data: body,
        });
        return this.pickEmbed(data);
      } catch (_) { return ""; }
    };

    if ((cfg.method || "").toLowerCase() === "admin-ajax") {
      return (await tryAjax()) || (await tryJson());
    }
    return (await tryJson()) || (await tryAjax());
  }

  pickEmbed(data) {
    if (!data) return "";
    let embed = "";
    if (typeof data === "object") {
      embed = data.embed_url || data.embed || data.url || "";
    } else if (typeof data === "string") {
      const f = data.match(/<iframe[^>]+src=["']([^"']+)["']/i) ||
        data.match(/(https?:\/\/[^"'<>\s]+\.(?:m3u8|mp4)[^"'<>\s]*)/i);
      embed = f ? f[1] : "";
    }
    return this.decodeUrl(embed);
  }

  stream(s) {
    return { type: s.type, url: s.url, headers: s.headers };
  }

  // ------------------------------------------------------------------ helpers
  async playerOptions(res) {
    const out = [];
    let items = [];
    try {
      items = await this.querySelectorAll(res, "li.dooplay_player_option");
    } catch (_) {
      items = [];
    }
    for (const li of items) {
      const html = li.content;
      const post = (html.match(/data-post=["']([^"']+)["']/i) || [])[1];
      const nume = (html.match(/data-nume=["']([^"']+)["']/i) || [])[1];
      const type = (html.match(/data-type=["']([^"']+)["']/i) || [])[1];
      const tm = html.match(/<span[^>]*class=["'][^"']*\btitle\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
      const name = tm ? tm[1].replace(/<[^>]+>/g, "").trim() : "";
      const sm = html.match(/<span[^>]*class=["'][^"']*\bserver\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
      const server = sm ? sm[1].replace(/<[^>]+>/g, "").trim() : "";
      if (post && type) {
        out.push({ post: post, nume: nume || "1", type: type, name: name, server: server });
      }
    }
    return out;
  }

  // Lee el objeto dtAjax (url_api absoluto, admin-ajax y play_method).
  dtConfig(html, host) {
    const cfg = { api: "", ajax: "", method: "" };
    if (!html || typeof html !== "string") return cfg;
    const m = html.match(/dtAjax\s*=\s*\{([\s\S]*?)\}/i);
    const block = m ? m[1] : html;
    const api = (block.match(/url_api["']?\s*:\s*["']([^"']+)["']/i) || [])[1];
    const ajax = (block.match(/["']url["']\s*:\s*["']([^"']+)["']/i) || [])[1];
    const method = (block.match(/play_method["']?\s*:\s*["']([^"']+)["']/i) || [])[1];
    if (api) cfg.api = this.abs(this.decodeUrl(api), host);
    if (ajax) cfg.ajax = this.abs(this.decodeUrl(ajax), host);
    if (method) cfg.method = method;
    return cfg;
  }

  // Convierte una URL relativa/protocol-relative en absoluta.
  abs(u, host) {
    if (!u) return "";
    if (/^https?:/i.test(u)) return u;
    if (u.indexOf("//") === 0) return "https:" + u;
    return host + (u.charAt(0) === "/" ? "" : "/") + u;
  }

  async resolveStream(embed, referer) {
    if (!embed) return null;
    let src = this.decodeUrl(embed);
    if (src.indexOf("//") === 0) src = "https:" + src;

    // Snippet HTML (tipo "dtshcode"): extraer el src del iframe.
    if (/<iframe/i.test(src)) {
      const m = src.match(/src=["']([^"']+)["']/i);
      if (m) src = this.decodeUrl(m[1]);
      if (src.indexOf("//") === 0) src = "https:" + src;
    }

    const headers = { "Referer": referer, "User-Agent": UA };

    if (/\.m3u8(\?|#|$)/i.test(src)) {
      return { type: "hls", url: src, headers: headers, resolved: true };
    }
    if (/\.mp4(\?|#|$)/i.test(src)) {
      return { type: "mp4", url: src, headers: headers, resolved: true };
    }

    // Intentar resolver el embed de terceros buscando m3u8/mp4 en su HTML.
    try {
      const page = await this.request("", { headers: { "Miru-Url": src, "Referer": referer } });
      const found = this.findStreamUrl(page, src);
      if (found) return found;
    } catch (_) {}

    return { type: "hls", url: src, headers: headers, resolved: false };
  }

  // Busca la primera URL m3u8/mp4 en un texto (directa o escapada con \/).
  findStreamUrl(text, referer) {
    if (!text || typeof text !== "string") return null;
    const headers = { "Referer": referer, "User-Agent": UA };
    let m = text.match(/(https?:\\?\/\\?\/[^"'<>\s]+?\.m3u8[^"'<>\s]*)/i);
    if (m) return { type: "hls", url: this.decodeUrl(m[1]), headers: headers, resolved: true };
    m = text.match(/(https?:\\?\/\\?\/[^"'<>\s]+?\.mp4[^"'<>\s]*)/i);
    if (m) return { type: "mp4", url: this.decodeUrl(m[1]), headers: headers, resolved: true };
    return null;
  }

  // Normaliza URLs que vienen escapadas dentro de JSON/JS (https:\/\/...).
  decodeUrl(s) {
    return (s || "")
      .replace(/\\\//g, "/")
      .replace(/\\u0026/gi, "&")
      .replace(/&amp;/gi, "&")
      .replace(/&#0?38;/g, "&")
      .trim();
  }

  meta(html, key) {
    const tags = html.match(/<meta\b[^>]*>/gi) || [];
    for (const t of tags) {
      if (t.indexOf(key) !== -1) {
        const c = t.match(/content=["']([^"']*)["']/i);
        if (c) return c[1];
      }
    }
    return "";
  }
}
