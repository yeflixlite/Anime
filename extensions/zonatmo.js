// ==MiruExtension==
// @name         ZonaTMO
// @version      v0.1.0
// @author       YeaniFlix
// @lang         es
// @license      MIT
// @package      zonatmo
// @type         manga
// @icon         https://zonatmo.org/favicon/apple-touch-icon.png
// @webSite      https://zonatmo.org
// @nsfw         false
// ==/MiruExtension==

export default class extends Extension {
  constructor() {
    super();
    this.siteUrl = "https://zonatmo.org";
    // Exclusión obligatoria permanente de contenido +18, hentai, ecchi, doujinshi y adulto
    this.excludedGenderIds = [19, 27, 29, 32, 33, 44, 92, 123, 142, 144, 153];
  }

  getExcludeParam() {
    return this.excludedGenderIds.map((id) => `exclude_genders[]=${id}`).join("&");
  }

  isNsfw(text) {
    if (!text) return false;
    const nsfwPattern = /\b(hentai|doujinshi|ecchi|erotica|erótico|smut|\+18|\+19|adulto|adultos|gore|sin\s+censura|uncensored|r18|xxx)\b/i;
    return nsfwPattern.test(text);
  }

  async req(targetUrl) {
    return await this.request("", {
      headers: {
        "Miru-Url": targetUrl,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": "https://zonatmo.org/",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "es-ES,es;q=0.9"
      }
    });
  }

  parseCards(html) {
    const cards = [];
    const cardRegex = /<div[^>]*class="[^"]*element[^"]*"[\s\S]*?<a[^>]+href="([^"]+)"[\s\S]*?<\/a>\s*<\/div>/gi;
    let match;

    while ((match = cardRegex.exec(html)) !== null) {
      const cardHtml = match[0];
      const url = match[1];

      // Título
      const titleMatch = cardHtml.match(/<h4[^>]*title="([^"]+)"/i) || cardHtml.match(/<h4[^>]*>([\s\S]*?)<\/h4>/i);
      const rawTitle = titleMatch ? (titleMatch[1] || titleMatch[2]).replace(/<[^>]+>/g, "").trim() : "";

      // Tipo de obra
      const typeMatch = cardHtml.match(/<span[^>]*class="[^"]*book-type[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
      const rawType = typeMatch ? typeMatch[1].replace(/<[^>]+>/g, "").trim().toUpperCase() : "MANGA";

      // Filtro estricto de contenido no apto
      if (["DOUJINSHI", "HENTAI", "ECCHI", "ADULT", "+18"].includes(rawType)) {
        continue;
      }
      if (this.isNsfw(rawTitle) || this.isNsfw(rawType)) {
        continue;
      }

      // Portada
      const coverMatch = cardHtml.match(/data-bg="([^"]+)"/i) || cardHtml.match(/src="([^"]+)"/i);
      const cover = coverMatch ? coverMatch[1] : "";

      // Estado y demografía
      const statusMatch = cardHtml.match(/<span[^>]*class="[^"]*book-meta-status[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
      const status = statusMatch ? statusMatch[1].replace(/<[^>]+>/g, "").trim() : "";

      const demoMatch = cardHtml.match(/<span[^>]*class="[^"]*demography[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
      const demography = demoMatch ? demoMatch[1].replace(/<[^>]+>/g, "").trim() : "";
      if (this.isNsfw(demography)) {
        continue;
      }

      // Identificación de categoría original
      let typeLabel = "Manga";
      if (rawType.includes("NOVEL")) {
        typeLabel = "Novela";
      } else if (rawType.includes("MANHWA")) {
        typeLabel = "Manhwa";
      } else if (rawType.includes("MANHUA")) {
        typeLabel = "Manhua";
      } else if (rawType.includes("ONE_SHOT")) {
        typeLabel = "One Shot";
      }

      // Etiqueta visible en el título
      let displayTitle = "";
      if (typeLabel === "Novela") {
        displayTitle = `[Novela] ${rawTitle}`;
      } else if (typeLabel === "Manhwa") {
        displayTitle = `[Manhwa] ${rawTitle}`;
      } else {
        displayTitle = `[${typeLabel}] ${rawTitle}`;
      }

      cards.push({
        title: displayTitle,
        url: url,
        cover: cover,
        update: status ? `${typeLabel} • ${status}` : typeLabel
      });
    }

    return cards;
  }

  async createFilter() {
    return {
      type: {
        title: "Tipo de contenido",
        max: 1,
        min: 0,
        default: "",
        options: {
          "": "Todos (Aptos)",
          "manga": "Manga",
          "manhwa": "Manhwa",
          "novel": "Novela",
          "manhua": "Manhua"
        }
      },
      order: {
        title: "Ordenar por",
        max: 1,
        min: 0,
        default: "recently_updated",
        options: {
          "recently_updated": "Actualizados",
          "likes_count": "Populares",
          "creation": "Nuevos",
          "alphabetically": "Alfabético"
        }
      },
      demography: {
        title: "Demografía",
        max: 1,
        min: 0,
        default: "",
        options: {
          "": "Todas",
          "shounen": "Shounen",
          "seinen": "Seinen",
          "shoujo": "Shoujo",
          "josei": "Josei",
          "kodomo": "Kodomo"
        }
      },
      status: {
        title: "Estado",
        max: 1,
        min: 0,
        default: "",
        options: {
          "": "Todos",
          "ongoing": "En emisión",
          "completed": "Completado",
          "ended": "Finalizado",
          "hiatus": "En pausa"
        }
      }
    };
  }

  async latest(page = 1, filter = null) {
    const pageNum = page || 1;
    const type = filter?.type?.[0] || "";
    const order = filter?.order?.[0] || "recently_updated";
    const demography = filter?.demography?.[0] || "";
    const status = filter?.status?.[0] || "";

    let url = `${this.siteUrl}/biblioteca?order_item=${order}&order_dir=desc&${this.getExcludeParam()}&page=${pageNum}`;
    if (type) url += `&type=${encodeURIComponent(type)}`;
    if (demography) url += `&demography=${encodeURIComponent(demography)}`;
    if (status) url += `&status=${encodeURIComponent(status)}`;

    const res = await this.req(url);
    return this.parseCards(res);
  }

  async search(kw, page = 1) {
    if (!kw || this.isNsfw(kw)) {
      return [];
    }
    const pageNum = page || 1;
    const url = `${this.siteUrl}/biblioteca?title=${encodeURIComponent(kw)}&${this.getExcludeParam()}&page=${pageNum}`;
    const res = await this.req(url);
    return this.parseCards(res);
  }

  async detail(url) {
    const res = await this.req(url);

    // Delimitar al encabezado principal antes de la lista de capítulos
    const liMatch = res.match(/<li[^>]*class="[^"]*upload-link[^"]*"[^>]*>/i);
    const bodyIdx = res.indexOf("<body");
    const startIdx = bodyIdx !== -1 ? bodyIdx : 0;
    const endIdx = liMatch ? liMatch.index : res.length;
    const headerHtml = res.substring(startIdx, endIdx);

    // Verificar demografía y géneros en busca de contenido no apto
    const genreMatches = [...headerHtml.matchAll(/href="https:\/\/zonatmo\.org\/tag\/[^"]*"[^>]*>([\s\S]*?)<\/a>/gi)].map((m) =>
      m[1].replace(/<[^>]+>/g, "").trim()
    );
    for (const g of genreMatches) {
      if (this.isNsfw(g)) {
        throw new Error("Contenido no apto para todo público (bloqueado por política de seguridad).");
      }
    }

    // Título
    const titleMatch = headerHtml.match(/<h1[^>]*class="[^"]*element-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i) ||
                       headerHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    let title = titleMatch ? titleMatch[1].replace(/<small[\s\S]*?<\/small>/gi, "").replace(/<[^>]+>/g, "").trim() : "";

    if (this.isNsfw(title)) {
      throw new Error("Obra bloqueada por política de seguridad.");
    }

    // Identificación de tipo de contenido
    let typeLabel = "Manga";
    if (url.includes("/novel/")) {
      typeLabel = "Novela";
    } else if (url.includes("/manhwa/")) {
      typeLabel = "Manhwa";
    } else if (url.includes("/manhua/")) {
      typeLabel = "Manhua";
    } else {
      const typeBadge = headerHtml.match(/<h1[^>]*class="[^"]*book-type[^"]*"[^>]*>([\s\S]*?)<\/h1>/i) ||
                        headerHtml.match(/<span[^>]*class="[^"]*book-type[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
      if (typeBadge) {
        const rawT = typeBadge[1].replace(/<[^>]+>/g, "").trim().toUpperCase();
        if (rawT.includes("NOVEL")) typeLabel = "Novela";
        else if (rawT.includes("MANHWA")) typeLabel = "Manhwa";
        else if (rawT.includes("MANHUA")) typeLabel = "Manhua";
        else if (rawT.includes("DOUJINSHI") || rawT.includes("HENTAI")) {
          throw new Error("Contenido no apto para todo público.");
        }
      }
    }

    if (typeLabel === "Novela" && !title.startsWith("[Novela]")) {
      title = `[Novela] ${title}`;
    } else if (typeLabel === "Manhwa" && !title.startsWith("[Manhwa]")) {
      title = `[Manhwa] ${title}`;
    } else if (!title.startsWith(`[${typeLabel}]`)) {
      title = `[${typeLabel}] ${title}`;
    }

    // Portada
    const coverMatch = headerHtml.match(/<img[^>]+src=["'](https:\/\/zonatmo\.org\/storage\/[^"']+)["']/i) ||
                       headerHtml.match(/<img[^>]+src=["'](https:\/\/storage\d*\.zonatmo\.org\/[^"']+)["']/i) ||
                       headerHtml.match(/data-bg=["']([^"']+)["']/i);
    const cover = coverMatch ? coverMatch[1] : "";

    // Sinopsis
    const descMatch = headerHtml.match(/<p[^>]*class="[^"]*element-description[^"]*"[^>]*>([\s\S]*?)<\/p>/i) ||
                      headerHtml.match(/<div[^>]*class="[^"]*synopsis[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    const desc = descMatch ? descMatch[1].replace(/<[^>]+>/g, "").trim() : "";

    // Lista de capítulos
    const chapterItems = [...res.matchAll(/<li[^>]*class="[^"]*upload-link[^"]*"[^>]*>([\s\S]*?)<\/li>/gi)];
    const episodes = [];

    for (const ci of chapterItems) {
      const content = ci[1];
      const numMatch = content.match(/<span[^>]*class="[^"]*chapter-number[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
      const name = numMatch ? numMatch[1].replace(/<[^>]+>/g, "").trim() : "";

      const linkMatch = content.match(/href="(https:\/\/zonatmo\.org\/view_uploads\/\d+)"/i);
      if (linkMatch) {
        episodes.push({
          name: name || `Capítulo ${episodes.length + 1}`,
          url: linkMatch[1]
        });
      }
    }

    const genresText = genreMatches.length > 0 ? `\nGéneros: ${genreMatches.join(", ")}` : "";

    return {
      title,
      cover,
      desc: `Tipo: ${typeLabel}${genresText}\n\n${desc}`,
      episodes: [
        {
          title: "Capítulos",
          urls: episodes
        }
      ]
    };
  }

  async watch(url) {
    const res = await this.req(url);

    const images = [];
    // Extracción de imágenes del capítulo (almacenamiento CDN ZonaTMO)
    const regex = /<img[^>]+(?:src|data-src)=["']([^"']*(?:storage\d*\.zonatmo\.org\/chapters\/[^"']+))["']/gi;
    let match;
    while ((match = regex.exec(res)) !== null) {
      const imgUrl = match[1];
      if (!images.includes(imgUrl)) {
        images.push(imgUrl);
      }
    }

    // Fallback: lectores con clase reader-image
    if (images.length === 0) {
      const fallbackRegex = /<img[^>]+class="[^"]*reader-image[^"]*"[^>]+(?:src|data-src)=["']([^"']+)["']/gi;
      while ((match = fallbackRegex.exec(res)) !== null) {
        const imgUrl = match[1];
        if (!images.includes(imgUrl)) {
          images.push(imgUrl);
        }
      }
    }

    return { urls: images };
  }
}
