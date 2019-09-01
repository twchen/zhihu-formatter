// ==UserScript==
// @name         知乎重排for印象笔记
// @namespace    http://tampermonkey.net/
// @version      0.13
// @description  重新排版知乎的问答或者专栏，使“印象笔记·剪藏”只保存需要的内容。
// @author       twchen
// @include      https://www.zhihu.com/question/*/answer/*
// @include      https://zhuanlan.zhihu.com/p/*
// @include      https://www.zhihu.com/pin/*
// @run-at       document-idle
// @grant        GM.xmlHttpRequest
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      lens.zhihu.com
// @supportURL   https://twchen.github.io/zhihu-formatter
// ==/UserScript==

/**
 * 更新日志
 * v0.10
 * 1. 适应新专栏封面
 * 2. 缩小专栏标题字体
 * 3. 新功能：重排后可返回原页面
 *
 * v0.10.2
 * 1. 适应新导航栏
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
 */

(function() {
  "use strict";

  class Settings {
    constructor() {
      this.settings = {};
      this.div = null;
      GM_registerMenuCommand("设置", this.show.bind(this));
    }

    getValue(key) {
      return GM_getValue(key, this.settings[key].defaultOption);
    }

    setValue(key, value) {
      GM_setValue(key, value);
    }

    add_setting(key, desc, options, defaultOption) {
      this.settings[key] = {
        desc,
        options,
        defaultOption
      };
    }

    show() {
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
          if (this.getValue(key)) {
            checkbox.setAttribute("checked", "checked");
          }
          checkbox.onchange = event => {
            this.setValue(key, event.target.checked);
          };
          this.div.appendChild(checkbox);
        } else {
          for (let option of options) {
            const radio = document.createElement("input");
            const id = `${key}-${option}`;
            radio.id = id;
            radio.type = "radio";
            radio.setAttribute("name", key);
            radio.setAttribute("value", option);
            if (this.getValue(key) === option) {
              radio.setAttribute("checked", "checked");
            }
            radio.onchange = () => {
              this.setValue(key, option);
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

  const root = document.querySelector("#root");

  const httpRequest =
    typeof GM_xmlhttpRequest === "undefined" ? GM.xmlHttpRequest : GM_xmlhttpRequest;

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

  function formatZhuanlan() {
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
    let titleImage = document.querySelector(".TitleImage");
    if (titleImage) {
      titleImage = titleImage.cloneNode(true);
      titleImage.style.maxWidth = "100%";
      titleImage.style.cursor = "pointer";
      titleImage.title = "点击删除图片";
      titleImage.onclick = () => {
        div.removeChild(titleImage);
      };
      div.appendChild(titleImage);
    }
    div.append(header, post, time, topics);
    div.style.margin = "1rem";

    root.after(div);

    window.history.pushState("formatted", "");

    postprocess(div);
  }

  function formatPin() {
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
      // assume only one .PinItem-remainContentRichText has a video or some images, otherwise the code may not run correctly.
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
      settings.getValue("keepComments") === "否" ||
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
      if (settings.getValue("keepComments") === "此页后全部") {
        const commentsClone = div.querySelector(".CommentListV2");
        (async () => {
          while (true) {
            const comments = await getNextPageComments(root);
            if (comments === null) break;
            for (let i = 0; i < comments.children.length; ++i) {
              commentsClone.appendChild(comments.children[i].cloneNode(true));
            }
          }
        })();
      }
    }

    root.after(div);
    root.style.display = "none";
    window.history.pushState("formatted", "");

    fixLinks(div);
  }

  function replaceThumbnailsByRealImages(preview) {
    const realImages = document.createElement("div");
    const thumbnails = document.querySelectorAll("#root .Thumbnail-Wrapper");
    thumbnails.forEach(thumbnail => {
      const img = getRealImage(thumbnail);
      if (img !== null) realImages.appendChild(img);
    });

    try {
      const surplusSign = document.querySelector("#root .Thumbnail-Surplus-Sign");
      if (surplusSign !== null) {
        const numLeft = parseInt(surplusSign.innerText);
        thumbnails[thumbnails.length - 1].click();

        const imageGallery = document.querySelector(".ImageGallery-Inner");
        const arrowRight = document.querySelector("a.ImageGallery-arrow-right");
        for (let i = 0; i < numLeft; ++i) {
          arrowRight.click();
          const img = getRealImage(imageGallery);
          if (img !== null) realImages.appendChild(img);
        }

        const close = document.querySelector("a.ImageGallery-close");
        close.click();
      }
    } catch (error) {
      console.error(`Error retrieving remaining images: ${error.message}`);
    }

    realImages.querySelectorAll("img").forEach(img => {
      Object.assign(img.style, {
        maxWidth: "100%",
        display: "block",
        margin: "1rem auto"
      });
    });

    preview.replaceWith(realImages);
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
          if (new Date().getTime() - startTime > 3000) {
            clearInterval(id);
            reject(new Error("Timeout"));
            return;
          }
          const comments = root.querySelector(".CommentListV2");
          if (comments === null) return;
          clearInterval(id);
          resolve(comments);
        }, 100);
      }
    });
  }

  function replaceVideosByLinks(el) {
    const videoDivs = el.querySelectorAll("div.RichText-video");
    videoDivs.forEach(async div => {
      let href, title, thumbnail;
      try {
        const attr = div.attributes["data-za-extra-module"];
        const videoId = JSON.parse(attr.value).card.content.video_id;
        href = "https://www.zhihu.com/video/" + videoId;
        const info = await getVideoInfo(videoId);
        title = info.title;
        thumbnail = info.thumbnail;
      } catch (error) {
        console.error(`Error getting video info: ${error.message}`);
      }
      if (!href) {
        return;
      }
      const a = document.createElement("a");
      a.href = href;
      Object.assign(a.style, {
        color: "#337ab7",
        textDecoration: "underline"
      });
      if (!title && !thumbnail) {
        a.innerText = "视频: " + href;
      } else {
        const span = document.createElement("span");
        span.style.display = "block";
        span.innerText = "视频: ";
        a.appendChild(span);
        if (title) {
          span.innerText += title;
        }
        if (thumbnail) {
          const img = document.createElement("img");
          img.src = thumbnail;
          img.style.maxWidth = "100%";
          a.appendChild(img);
        }
      }
      div.replaceWith(a);
    });
  }

  function getVideoInfo(id) {
    return new Promise((resolve, reject) => {
      httpRequest({
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
      img.src = src.slice(0, i) + ".gif";
      div.replaceWith(img);
    } catch (error) {
      console.error(`Error enabling gif: ${error.message}`);
    }
  }

  function getAttrValOfAnyDOM(root, attr) {
    const el = root.querySelector(`*[${attr}]`);
    return el ? el.getAttribute(attr) : null;
  }

  function getAttrValFromNoscript(div, attr) {
    const nos = div.querySelector("noscript");
    let value = null;
    if (nos) {
      const content = nos.textContent || nos.innerText || nos.innerHTML;
      if (content) {
        const pattern = `${attr}="(.*?)"`;
        const re = new RegExp(pattern);
        const groups = content.match(re);
        if (groups) {
          value = groups[1];
        }
      }
    }
    return value;
  }

  function getAttrVal(div, attr) {
    return getAttrValOfAnyDOM(div, attr) || getAttrValFromNoscript(div, attr);
  }

  function getRealImage(el) {
    const imgSrcAttrs = ["data-original", "data-actualsrc", "data-src", "src"];
    let imgSrcs = imgSrcAttrs
      .map(attr => getAttrVal(el, attr))
      .filter(src => src != null && !src.toLowerCase().startsWith("data:"));

    // find unique filenames
    const filename2Src = {};
    imgSrcs.forEach(src => {
      const groups = src.split("/");
      const filename = groups[groups.length - 1];
      filename2Src[filename] = src;
    });
    imgSrcs = Object.values(filename2Src);

    if (imgSrcs.length > 0) {
      const img = document.createElement("img");
      const suffix = quality2Suffix[settings.getValue("imageQuality")];
      let i = 0;
      while (i < imgSrcs.length && !imgSrcs[i].includes(suffix)) ++i;
      if (i === imgSrcs.length) i = 0;
      img.src = imgSrcs[i];

      if (imgSrcs.length > 1) {
        img.onclick = () => {
          if (++i === imgSrcs.length) i = 0;
          img.src = imgSrcs[i];
        };

        img.onmouseover = event => {
          hint.style.display = "block";
          hint.style.top = event.clientY + "px";
          hint.style.left = event.clientX + 3 + "px";
        };

        img.onmouseleave = () => {
          hint.style.display = "none";
        };
        img.style.cursor = "pointer";
      }

      return img;
    } else {
      return null;
    }
  }

  // enable all gifs and load images
  function loadAllFigures(el) {
    const figures = el.querySelectorAll("figure");
    figures.forEach(figure => {
      const gifDiv = figure.querySelector("div.RichText-gifPlaceholder");
      if (gifDiv !== null) {
        enableGIF(gifDiv);
      } else {
        const img = getRealImage(figure);
        if (img) {
          const el = figure.querySelector("img") || figure.querySelector("noscript");
          if (el) {
            el.replaceWith(img);
          } else {
            figure.prepend(img);
          }
        }
      }

      const imgs = figure.querySelectorAll("img");
      imgs.forEach(img => {
        Object.assign(img.style, {
          maxWidth: "100%",
          display: "block",
          margin: "auto"
        });
      });
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
      const ellipsis = a.querySelector(":scope > span.ellipsis");
      if (ellipsis) {
        a.innerHTML =
          a.innerText.length > LINK_TEXT_MAX_LEN
            ? a.innerText.slice(0, LINK_TEXT_MAX_LEN) + "..."
            : a.innerText;
      }
    });
  }

  function postprocess(el) {
    replaceVideosByLinks(el);
    loadAllFigures(el);
    fixLinks(el);
  }

  function injectToNav() {
    const url = window.location.href;
    if (url.includes("zhuanlan")) addBtnToNav();
    else if (url.includes("answer")) addLinkToNav(formatAnswer);
    else addLinkToNav(formatPin);
  }

  injectToNav();

  const hint = document.createElement("div");
  hint.innerText = "点击图片换不同分辨率（如有）";
  Object.assign(hint.style, {
    display: "none",
    position: "fixed",
    backgroundColor: "white",
    border: "1px solid black"
  });

  const LINK_TEXT_MAX_LEN = 50;

  document.body.append(hint);

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

  const settings = new Settings();
  settings.add_setting("imageQuality", "默认图片质量", ["原始", "高清"], "原始");
  settings.add_setting(
    "keepComments",
    "重排想法时保留评论",
    ["否", "仅此页", "此页后全部"],
    "仅此页"
  );
  const quality2Suffix = {
    原始: "_r.",
    高清: "_hd."
  };
})();
