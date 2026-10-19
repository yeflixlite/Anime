// ==MiruExtension==
// @name         Anime Ninja
// @version      v0.1.0
// @author       YeaniFlix
// @lang         es
// @license      MIT
// @package      animeninja
// @type         bangumi
// @icon         https://ww3.animeonline.ninja/favicon.ico
// @webSite      https://ww3.animeonline.ninja
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
// IMPORTANTE (Cloudflare): el sitio esta detras de un challenge interactivo.
// Abrir la web una vez dentro del WebView de la app para obtener la cookie
// cf_clearance; despues esta extension (que comparte el cookie jar) funciona.

const SITE = "https://ww3.animeonline.ninja";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export default class extends Extension {
  async latest(page) {
    const p = Math.max(1, parseInt(page) || 1);
    const path = p === 1 ? "/genero/animeflix/" : "/genero/animeflix/page/" + p + "/";
    const res = await this.request(path, { headers: { "Miru-Url": SITE } });
    return this.parseList(res);
  }

  async search(kw, page) {
    const q = encodeURIComponent(((kw || "") + "").trim());
    const p = Math.max(1, parseInt(page) || 1);
    const path = p === 1 ? "/?s=" + q : "/?s=" + q + "&paged=" + p;
    const res = await this.request(path, { headers: { "Miru-Url": SITE } });
    return this.parseList(res);
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

  // ------------------------------------------------------------------ detalle
  async detail(url) {
    const res = await this.request("", { headers: { "Miru-Url": url } });
    if (!res || typeof res !== "string") {
      return { title: "", cover: "", desc: "", episodes: [] };
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
      groups.push({ title: "Ver", urls: [{ name: "Reproducir", url: url }] });
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

      // 1) Servidores declarados por Dooplay (wp-json / admin-ajax)
      const opts = await this.playerOptions(res);
      let fallback = null;
      for (const opt of opts) {
        const embed = await this.fetchEmbed(host, url, opt);
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
  // el clasico admin-ajax (action=doo_player_ajax).
  async fetchEmbed(host, referer, opt) {
    const api =
      host + "/wp-json/dooplayer/v1/post/" + opt.post +
      "?type=" + encodeURIComponent(opt.type) +
      "&source=" + encodeURIComponent(opt.nume);
    try {
      const data = await this.request("", { headers: { "Miru-Url": api, "Referer": referer } });
      const embed = this.pickEmbed(data);
      if (embed) return embed;
    } catch (_) {}

    try {
      const body =
        "action=doo_player_ajax&post=" + encodeURIComponent(opt.post) +
        "&nume=" + encodeURIComponent(opt.nume) +
        "&type=" + encodeURIComponent(opt.type);
      const data = await this.request("", {
        method: "post",
        headers: {
          "Miru-Url": host + "/wp-admin/admin-ajax.php",
          "Referer": referer,
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        },
        data: body,
      });
      return this.pickEmbed(data);
    } catch (_) {}

    return "";
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
      if (post && nume && type) out.push({ post: post, nume: nume, type: type, name: name });
    }
    return out;
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
