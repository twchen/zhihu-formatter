// ==UserScript==
// @name         知乎重排for印象笔记
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  重新排版知乎的问答，专栏或想法，使"印象笔记·剪藏"只保存需要的内容。
// @author       twchen
// @match        https://www.zhihu.com/question/*/answer/*
// @match        https://zhuanlan.zhihu.com/p/*
// @match        https://www.zhihu.com/pin/*
// @run-at       document-idle
// @inject-into  auto
// @grant        GM.xmlHttpRequest
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @grant        GM.getValue
// @grant        GM_getValue
// @grant        GM.setValue
// @grant        GM_setValue
// @connect      lens.zhihu.com
// @connect      api.zhihu.com
// @connect      www.zhihu.com
// @supportURL   https://twchen.github.io/zhihu-formatter
// ==/UserScript==

/**
 * 更新日志
 *
 * v0.11
 * 1. 图片居中
 * 2. 保留figcaption
 * 3. 增加默认图片质量配置
 *
 * v0.12
 * 1. 新增设置界面
 * 2. 支持重排想法
 *
 * v0.13
 * 1. 把重定向链接改为直链
 * 2. 解决一些链接在印象笔记客户端无法点击的问题
 *
 * v0.14
 * 1. 兼容Greasemonkey 4 API
 * 2. 在右下角新增设置按钮
 *
 * v1.0
 * 1. 用API获得想法里的图片链接
 * 2. 根据知乎图床的命名规则获得不同质量的图片的链接
 * 3. 保留视频原有样式
 * 4. 解决用Firefox保存专栏时公式无法显示的问题
 *
 */

// GM 4 API polyfill
if (typeof GM == "undefined") {
  this.GM = {};
  [["getValue", GM_getValue], ["setValue", GM_setValue]].forEach(([newFunc, oldFunc]) => {
    GM[newFunc] = (...args) => {
      return new Promise((resolve, reject) => {
        try {
          resolve(oldFunc(...args));
        } catch (error) {
          reject(error);
        }
      });
    };
  });
  GM.xmlHttpRequest = GM_xmlhttpRequest;
}

(function() {
  "use strict";

  function addLinkToNav(onclick) {
    const nav = document.querySelector(".AppHeader-Tabs");
    const li = nav.querySelector("li").cloneNode(true);
    const a = li.querySelector("a");
    a.href = "#";
    a.text = "重排";
    a.onclick = event => {
      event.preventDefault();
      onclick();
    };
    nav.appendChild(li);
  }

  function addBtnToNav() {
    const pageHeader = document.querySelector("div.ColumnPageHeader-Button");
    const btn = document.createElement("button");
    btn.setAttribute("type", "button");
    btn.innerText = "重新排版";
    btn.classList.add("Button", "Button--blue");
    btn.style.marginRight = "1rem";
    btn.onclick = formatZhuanlan;
    pageHeader.prepend(btn);
  }

  function formatAnswer() {
    root.style.display = "none";
    let div = document.querySelector("#formatted");
    if (div !== null) {
      div.remove();
    }

    const showMoreBtn = document.querySelector("button.Button.QuestionRichText-more");
    if (showMoreBtn !== null) showMoreBtn.click();
    const title = document.querySelector("h1.QuestionHeader-title").cloneNode(true);
    const detail = document.querySelector("div.QuestionHeader-detail").cloneNode(true);

    const question = document.createElement("div");
    question.appendChild(title);
    question.appendChild(detail);

    Object.assign(question.style, {
      backgroundColor: "white",
      margin: "0.8rem 0",
      padding: "0.2rem 1rem 1rem",
      borderRadius: "2px",
      boxShadow: "0 1px 3px rgba(26,26,26,.1)"
    });

    const answer = document.querySelector("div.Card.AnswerCard").cloneNode(true);
    // remove non-working actions
    const actions = answer.querySelector(".ContentItem-actions");
    actions.parentNode.removeChild(actions);

    div = document.createElement("div");
    div.id = "formatted";
    div.appendChild(question);
    div.appendChild(answer);

    // insert after root
    root.after(div);

    window.history.pushState("formatted", "");

    postprocess(div);
  }

  async function formatZhuanlan() {
    root.style.display = "none";
    let div = document.querySelector("#formatted");
    if (div !== null) {
      div.remove();
    }

    const header = document.querySelector("header.Post-Header").cloneNode(true);
    const title = header.querySelector(".Post-Title");
    Object.assign(title.style, {
      fontSize: "1.5rem",
      fontWeight: "bold",
      marginBottom: "1rem"
    });

    const post = document.querySelector("div.Post-RichText").cloneNode(true);
    const time = document.querySelector("div.ContentItem-time").cloneNode(true);
    const topics = document.querySelector("div.Post-topicsAndReviewer").cloneNode(true);

    div = document.createElement("div");
    div.id = "formatted";

    const titleImage = document.querySelector(".TitleImage");
    if (titleImage) {
      const img = (await getRealImage(titleImage)) || titleImage.cloneNode(true);
      div.appendChild(img);
    }

    div.append(header, post, time, topics);
    div.style.margin = "1rem";

    root.after(div);

    window.history.pushState("formatted", "");

    loadEuqations(div);
    postprocess(div);
  }

  async function formatPin() {
    let div = document.querySelector("#formatted");
    if (div !== null) {
      div.remove();
    }

    const pinItem = document.querySelector(".PinItem");
    div = pinItem.cloneNode(true);
    div.id = "formatted";
    div.style.margin = "1rem";

    const remainContents = div.querySelectorAll(".PinItem-remainContentRichText");
    remainContents.forEach(remainContent => {
      // assume either the original pin or the repost pin has non-text content (video/image), not both.
      // otherwise the code may not run correctly.
      if (remainContent.querySelector(".RichText-video")) {
        // show video
        replaceVideosByLinks(remainContent);
      }
      const preview = remainContent.querySelector(".Image-Wrapper-Preview");
      if (preview) {
        // show all images
        replaceThumbnailsByRealImages(preview);
      }
    });

    if (
      (await settings.get("keepComments")) === "否" ||
      div.querySelector(".CommentListV2") === null ||
      div.querySelector(".CommentListV2").children.length === 0
    ) {
      const comments = div.querySelector(".Comments-container");
      comments.style.display = "none";
    } else {
      // hide the comment editor
      const commentEditor = div.querySelector(".CommentEditorV2--normal");
      commentEditor.style.display = "none";
      // get all remaining comments
      if ((await settings.get("keepComments")) === "此页后全部") {
        const commentsClone = div.querySelector(".CommentListV2");

        while (true) {
          const comments = await getNextPageComments(root);
          if (comments === null) break;
          for (let i = 0; i < comments.children.length; ++i) {
            commentsClone.appendChild(comments.children[i].cloneNode(true));
          }
        }
      }
    }

    root.after(div);
    root.style.display = "none";
    window.history.pushState("formatted", "");

    fixLinks(div);
  }

  async function replaceThumbnailsByRealImages(preview) {
    const realImages = document.createElement("div");
    try {
      const groups = /^\/pin\/(\d+)/.exec(window.location.pathname);
      const pinId = groups[1];
      const pinInfo = await getPinInfo(pinId);
      const content = (pinInfo.origin_pin || pinInfo).content;
      for (let i = 0; i < content.length; ++i) {
        const item = content[i];
        if (item.type === "image") {
          const img = await createImgFromURL(item.url);
          realImages.appendChild(img);
        }
      }
      preview.replaceWith(realImages);
    } catch (error) {
      console.error(`Error getting all images: ${error.message}`);
    }
  }

  async function getPinInfo(pinId) {
    return new Promise((resolve, reject) => {
      GM.xmlHttpRequest({
        method: "GET",
        url: "https://api.zhihu.com/pins/" + pinId,
        onload: response => {
          try {
            const json = JSON.parse(response.responseText);
            resolve(json);
          } catch (error) {
            reject(error);
          }
        },
        onerror: response => {
          reject({
            message: `Error getting pin info. Status:${response.status}. StatusText: ${response.statusText}`
          });
        }
      });
    });
  }

  function getNextPageComments(root) {
    return new Promise((resolve, reject) => {
      const nextPage = root.querySelector(".PaginationButton-next");
      if (nextPage === null) {
        resolve(null);
      } else {
        nextPage.click();
        const startTime = new Date().getTime();
        const id = setInterval(() => {
          if (new Date().getTime() - startTime > 5000) {
            clearInterval(id);
            reject(new Error("Timeout"));
            return;
          }
          const comments = root.querySelector(".CommentListV2");
          if (comments === null) return;
          clearInterval(id);
          resolve(comments);
        }, 200);
      }
    });
  }

  function replaceVideosByLinks(el) {
    let videoDivs = el.querySelectorAll(".RichText-video");
    if (el.classList.contains("RichText-video")) {
      videoDivs = [...videoDivs, el];
    }
    videoDivs.forEach(async div => {
      try {
        const attr = div.attributes["data-za-extra-module"];
        const videoId = JSON.parse(attr.value).card.content.video_id;
        const href = "https://www.zhihu.com/video/" + videoId;
        const { thumbnail } = await getVideoInfo(videoId);

        const video = div.querySelector(".VideoCard-video");
        video.parentNode.style.textAlign = "center";
        const a = document.createElement("a");
        a.href = href;
        Object.assign(a.style, {
          color: "#337ab7",
          textDecoration: "underline",
          width: "100%"
        });
        if (thumbnail) {
          const img = document.createElement("img");
          img.src = thumbnail;
          img.style.maxWidth = "100%";
          a.appendChild(img);
        } else {
          a.innerText = "视频：" + href;
        }
        video.replaceWith(a);
      } catch (error) {
        console.error(`Error getting video info: ${error.message}`);
      }
    });
  }

  function getVideoInfo(id) {
    return new Promise((resolve, reject) => {
      GM.xmlHttpRequest({
        method: "GET",
        url: `https://lens.zhihu.com/api/videos/${id}`,
        headers: {
          "Content-Type": "application/json",
          Origin: "https://v.vzuu.com",
          Referer: `https://v.vzuu.com/video/${id}`
        },
        onload: response => {
          try {
            const json = JSON.parse(response.responseText);
            const title = json.title;
            const thumbnail = json.cover_info.thumbnail;
            resolve({
              title,
              thumbnail
            });
          } catch (error) {
            reject(error);
          }
        },
        onerror: response => {
          reject({
            message: `Status: ${response.status}. StatusText: ${response.statusText}`
          });
        }
      });
    });
  }

  function enableGIF(div) {
    try {
      const src = div.querySelector("img").src;
      const img = document.createElement("img");
      const i = src.lastIndexOf(".");
      img.src = src.slice(0, i + 1) + GIF_EXT;
      Object.assign(img.style, {
        maxWidth: "100%",
        display: "block",
        margin: "auto"
      });
      div.replaceWith(img);
    } catch (error) {
      console.error(`Error enabling gif: ${error.message}`);
    }
  }

  function getAttrValOfAnyDOM(el, attr) {
    const res = el.querySelector(`*[${attr}]`) || el;
    return res.getAttribute(attr);
  }

  function getAttrValFromNoscript(el, attr) {
    let noscripts = el.querySelectorAll("noscript");
    const re = new RegExp(`${attr}="(.*?)"`);
    if (el.tagName === "NOSCRIPT") {
      noscripts = [...noscripts, el];
    }
    for (let i = 0; i < noscripts.length; ++i) {
      const nos = noscripts[i];
      const content = nos.textContent || nos.innerText || nos.innerHTML;
      if (content) {
        const groups = re.exec(content);
        if (groups) {
          return groups[1];
        }
      }
    }
    return null;
  }

  function getAttrVal(el, attr) {
    return getAttrValOfAnyDOM(el, attr) || getAttrValFromNoscript(el, attr);
  }

  async function getRealImage(el) {
    const imgSrcAttrs = ["data-original", "data-actualsrc", "data-src", "src"];
    let imgSrcs = imgSrcAttrs
      .map(attr => getAttrVal(el, attr))
      .filter(src => src != null && IMG_SRC_REG_EX.test(src));

    return imgSrcs.length > 0 ? await createImgFromURL(imgSrcs[0]) : null;
  }

  async function createImgFromURL(url) {
    const suffix = QUALITY_TO_SUFFIX[await settings.get("imageQuality")];
    const image = new ZhihuImage(url, suffix);
    const img = document.createElement("img");
    img.src = image.next();

    img.onclick = () => {
      img.src = image.next();
    };

    img.onmouseover = event => {
      hint.style.display = "block";
      hint.style.top = event.clientY + "px";
      hint.style.left = event.clientX + 3 + "px";
    };

    img.onmouseleave = () => {
      hint.style.display = "none";
    };

    Object.assign(img.style, {
      maxWidth: "100%",
      display: "block",
      margin: "1rem auto",
      cursor: "pointer"
    });
    return img;
  }

  // enable all gifs and load images
  function loadAllFigures(el) {
    const figures = el.querySelectorAll("figure");
    figures.forEach(async figure => {
      const gifDiv = figure.querySelector("div.RichText-gifPlaceholder");
      if (gifDiv !== null) {
        enableGIF(gifDiv);
      } else {
        const img = await getRealImage(figure);
        if (img) {
          const el = figure.querySelector("img") || figure.querySelector("noscript");
          el ? el.replaceWith(img) : figure.prepend(img);
        }
      }
    });
  }

  function fixLinks(el) {
    const re = /https?:\/\/link\.zhihu\.com\/\?target=(.*)/i;
    const as = el.querySelectorAll("a");
    as.forEach(a => {
      // fix indirect links
      const groups = re.exec(a.href);
      if (groups) {
        a.href = decodeURIComponent(groups[1]);
      }

      // fix links with hidden texts
      const spans = a.querySelectorAll(
        ":scope > span.invisible, :scope > span.visible, :scope > span.ellipsis"
      );
      if (spans.length === a.children.length) {
        a.innerHTML =
          a.innerText.length > LINK_TEXT_MAX_LEN
            ? a.innerText.slice(0, LINK_TEXT_MAX_LEN) + "..."
            : a.innerText;
      }
    });
  }

  function getEquationSVGData(url) {
    return new Promise((resolve, reject) => {
      GM.xmlHttpRequest({
        method: "GET",
        url,
        onload: response => {
          resolve(response.response);
        },
        onerror: response => {
          reject({
            message: `Status: ${response.status}. StatusText: ${response.statusText}`
          });
        }
      });
    });
  }

  // The web clipper on Firefox saves SVG equations as files, not images.
  // This function converts all equations to PNG images.
  function loadEuqations(el) {
    const isFirefox = typeof InstallTrigger !== "undefined";
    if (!isFirefox) return;
    const equationImgs = el.querySelectorAll('img[src^="https://www.zhihu.com/equation"]');
    equationImgs.forEach(async img => {
      try {
        const svgData = await getEquationSVGData(img.src);
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        const svg = document.createElement("img");
        svg.width = canvas.width = img.width;
        svg.height = canvas.height = img.height;
        svg.onload = () => {
          ctx.drawImage(svg, 0, 0, svg.width, svg.height);
          img.src = canvas.toDataURL("image/png");
        };
        svg.src = "data:image/svg+xml," + encodeURIComponent(svgData);
      } catch (error) {
        console.error(`Error converting equation: ${error.message}`);
      }
    });
  }

  function postprocess(el) {
    replaceVideosByLinks(el);
    loadAllFigures(el);
    fixLinks(el);
  }

  class ZhihuImage {
    constructor(src, defaultSuffix) {
      const groups = IMG_SRC_REG_EX.exec(src);
      this.prefix = groups[1];
      this.ext = groups[3];
      this.i = SUFFIX.indexOf(defaultSuffix);
      if (this.i === -1) this.i = 0;
    }

    next() {
      const src = `${this.prefix}_${SUFFIX[this.i]}.${this.ext}`;
      if (++this.i === SUFFIX.length) this.i = 0;
      return src;
    }
  }

  class Settings {
    constructor() {
      this.settings = {};
      this.div = null;
      if (typeof GM_registerMenuCommand !== "undefined") {
        GM_registerMenuCommand("设置", this.show.bind(this));
      }
      const cornerButtons = document.querySelector(".CornerButtons");
      if (cornerButtons) {
        const div = document.createElement("div");
        div.classList.add("CornerAnimayedFlex");
        const button = document.createElement("button");
        button.classList.add("Button", "CornerButton", "Button--plain");
        button.setAttribute("type", "button");
        button.setAttribute("data-tooltip", "设置知乎重排");
        button.setAttribute("data-tooltip-position", "left");
        button.innerHTML = SETTING_ICON_HTML;
        button.onclick = this.show.bind(this);
        div.appendChild(button);
        cornerButtons.prepend(div);
      }
    }

    async get(key) {
      return await GM.getValue(key, this.settings[key].defaultOption);
    }

    async set(key, value) {
      return await GM.setValue(key, value);
    }

    add_setting(key, desc, options, defaultOption) {
      this.settings[key] = {
        desc,
        options,
        defaultOption
      };
    }

    async show() {
      this.close();
      this.div = document.createElement("div");
      Object.assign(this.div.style, {
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        backgroundColor: "white",
        border: "1px solid black",
        borderRadius: "5px",
        padding: "0.8rem",
        width: "24rem",
        zIndex: 999
      });

      for (let key in this.settings) {
        if (this.div.children.length > 0) {
          this.div.appendChild(document.createElement("br"));
        }
        const { desc, options } = this.settings[key];
        const descSpan = document.createElement("span");
        descSpan.innerText = `${desc}: `;
        this.div.appendChild(descSpan);
        // the setting is binary
        if (options.length === 2 && options.includes(true) && options.includes(false)) {
          const checkbox = document.createElement("input");
          checkbox.type = "checkbox";
          if (await this.get(key)) {
            checkbox.setAttribute("checked", "checked");
          }
          checkbox.onchange = event => {
            this.set(key, event.target.checked);
          };
          this.div.appendChild(checkbox);
        } else {
          const savedOption = await this.get(key);
          for (let option of options) {
            const radio = document.createElement("input");
            const id = `${key}-${option}`;
            radio.id = id;
            radio.type = "radio";
            radio.setAttribute("name", key);
            radio.setAttribute("value", option);
            if (option === savedOption) {
              radio.setAttribute("checked", "checked");
            }
            radio.onchange = () => {
              this.set(key, option);
            };
            this.div.appendChild(radio);
            const label = document.createElement("label");
            label.setAttribute("for", id);
            label.innerText = option;
            this.div.appendChild(label);
          }
        }
      }
      if (this.div.children.length > 0) {
        const closeBtn = document.createElement("span");
        closeBtn.innerText = "X";
        closeBtn.onclick = this.close.bind(this);
        Object.assign(closeBtn.style, {
          position: "absolute",
          top: "0.5rem",
          right: "0.5rem",
          cursor: "pointer"
        });
        this.div.appendChild(closeBtn);
        document.body.appendChild(this.div);
      }
    }

    close() {
      if (this.div !== null) {
        this.div.remove();
        this.div = null;
      }
    }
  }

  // global constants
  const QUALITY_TO_SUFFIX = {
    原始: "r",
    高清: "hd",
    缩略: "b"
  };
  const IMG_SRC_REG_EX = /^(https?:\/\/.+[a-z0-9]{32})(_\w+)?\.(\w+)$/;
  const SUFFIX = ["r", "hd", "b"];
  //const SUFFIX = ["r", "hd", "b", "xl", "t", "l", "m", "s"];
  const GIF_EXT = "gif"; // can be changed to .webp, but Evernote does not support it.
  const LINK_TEXT_MAX_LEN = 50;
  const SETTING_ICON_HTML = `<svg t="1567388644978" viewBox="0 0 1024 1024" version="1.1" p-id="1116" width="24" height="24" fill="currentColor">
    <defs><style type="text/css"></style></defs>
    <path d="M1020.1856 443.045888c-4.01408-21.634048-25.494528-43.657216-47.776768-48.529408l-16.662528-3.702784c-39.144448-11.49952-73.873408-36.640768-95.955968-73.670656-22.081536-37.225472-27.300864-79.517696-17.665024-118.301696l5.219328-15.20128c6.62528-21.049344-2.00704-50.087936-19.472384-64.510976 0 0-15.657984-12.862464-59.82208-37.614592-44.164096-24.556544-63.235072-31.378432-63.235072-31.378432-21.479424-7.600128-51.591168-0.38912-67.249152 15.787008l-11.64288 12.0832c-29.710336 27.285504-69.658624 43.851776-113.82272 43.851776-44.164096 0-84.513792-16.760832-114.224128-44.240896l-11.241472-11.69408C371.177472 49.74592 340.865024 42.534912 319.3856 50.13504c0 0-19.27168 6.821888-63.435776 31.378432-44.164096 24.946688-59.621376 37.810176-59.621376 37.810176-17.46432 14.227456-26.09664 43.071488-19.472384 64.315392l4.81792 15.396864c9.435136 38.784 4.416512 80.88064-17.665024 118.106112-22.08256 37.225472-57.212928 62.56128-96.559104 73.865216l-16.059392 3.508224C29.308928 399.388672 7.6288 421.21728 3.61472 443.045888c0 0-3.613696 19.488768-3.613696 68.992 0 49.504256 3.613696 68.993024 3.613696 68.993024 4.01408 21.828608 25.494528 43.657216 47.776768 48.529408l15.657984 3.508224c39.346176 11.303936 74.677248 36.639744 96.759808 74.059776 22.081536 37.225472 27.300864 79.517696 17.665024 118.301696l-4.617216 15.00672c-6.62528 21.049344 2.00704 50.087936 19.472384 64.510976 0 0 15.657984 12.862464 59.82208 37.614592 44.164096 24.751104 63.235072 31.377408 63.235072 31.377408 21.479424 7.601152 51.591168 0.390144 67.249152-15.785984l11.040768-11.49952c29.91104-27.480064 70.060032-44.240896 114.424832-44.240896 44.3648 0 84.714496 16.956416 114.424832 44.43648l11.040768 11.49952c15.45728 16.175104 45.769728 23.387136 67.249152 15.785984 0 0 19.27168-6.821888 63.435776-31.378432 44.164096-24.751104 59.621376-37.614592 59.621376-37.614592 17.46432-14.227456 26.09664-43.267072 19.472384-64.509952l-4.81792-15.592448c-9.435136-38.58944-4.416512-80.68608 17.665024-117.715968 22.08256-37.225472 57.413632-62.756864 96.759808-74.0608l15.65696-3.508224c22.08256-4.872192 43.762688-26.7008 47.777792-48.528384 0 0 3.613696-19.489792 3.613696-68.993024-0.200704-49.698816-3.8144-69.187584-3.8144-69.187584zM512.100352 710.2464c-112.617472 0-204.157952-88.677376-204.157952-198.208512 0-109.335552 91.339776-198.012928 204.157952-198.012928 112.617472 0 204.157952 88.677376 204.157952 198.208512C716.0576 621.568 624.717824 710.2464 512.100352 710.2464z" p-id="1117"></path>
  </svg>`;

  // global variables
  const root = document.querySelector("#root");
  const hint = document.createElement("div");
  hint.innerText = "点击图片更换分辨率（如有）";
  Object.assign(hint.style, {
    display: "none",
    position: "fixed",
    backgroundColor: "white",
    border: "1px solid black"
  });
  const settings = new Settings();

  function main() {
    // inject format button/link
    const url = window.location.href;
    if (url.includes("zhuanlan")) addBtnToNav();
    else if (url.includes("answer")) addLinkToNav(formatAnswer);
    else addLinkToNav(formatPin);

    settings.add_setting("imageQuality", "默认图片质量", ["原始", "高清", "缩略"], "原始");
    settings.add_setting(
      "keepComments",
      "重排想法时保留评论",
      ["否", "仅此页", "此页后全部"],
      "仅此页"
    );

    // handle backward/forward events
    window.addEventListener("popstate", function(event) {
      const div = document.querySelector("#formatted");
      if (event.state === "formatted") {
        root.style.display = "none";
        div.style.display = "block";
      } else {
        root.style.display = "block";
        div.style.display = "none";
      }
    });

    document.body.append(hint);
  }

  main();
})();
