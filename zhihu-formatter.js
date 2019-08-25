// ==UserScript==
// @name         知乎重排for印象笔记
// @namespace    http://tampermonkey.net/
// @version      0.11
// @description  重新排版知乎的问答或者专栏，使“印象笔记·剪藏”只保存需要的内容。
// @author       twchen
// @include      https://www.zhihu.com/question/*/answer/*
// @include      https://zhuanlan.zhihu.com/p/*
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
 * v0.7
 * 1. 在<noscript>里搜索图片链接
 * 2. 点击图片改变分辨率
 *
 * v0.8
 * 1. 改变图片的鼠标指针样式，使之更明显
 * 2. 把图片提示改为中文
 *
 * v0.9
 * 1. 保留专栏封面照片。点击可删除。
 *
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
 */

(function() {
  "use strict";

  const root = document.querySelector("#root");

  const httpRequest =
    typeof GM_xmlhttpRequest === "undefined"
      ? GM.xmlHttpRequest
      : GM_xmlhttpRequest;

  function addLinkToNav() {
    const nav = document.querySelector(".AppHeader-Tabs");
    const li = nav.querySelector("li").cloneNode(true);
    const a = li.querySelector("a");
    a.href = "#";
    a.text = "重排";
    a.onclick = event => {
      event.preventDefault();
      formatAnswer();
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
    btn.onclick = () => {
      formatZhuanlan();
    };
    pageHeader.prepend(btn);
  }

  function formatAnswer() {
    root.style.display = "none";
    let div = document.querySelector("#formatted");
    if (div !== null) {
      div.style.display = "block";
      window.history.pushState("formatted", "");
      return;
    }

    const showMoreBtn = document.querySelector(
      "button.Button.QuestionRichText-more"
    );
    if (showMoreBtn !== null) showMoreBtn.click();
    const title = document
      .querySelector("h1.QuestionHeader-title")
      .cloneNode(true);
    const detail = document
      .querySelector("div.QuestionHeader-detail")
      .cloneNode(true);

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

    const answer = document
      .querySelector("div.Card.AnswerCard")
      .cloneNode(true);
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
      div.style.display = "block";
      window.history.pushState("formatted", "");
      return;
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
    const topics = document
      .querySelector("div.Post-topicsAndReviewer")
      .cloneNode(true);

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

  function loadImage(figure) {
    const imgSrcAttrs = ["data-original", "data-src", "src", "data-actualsrc"];
    let imgSrcs = imgSrcAttrs
      .map(attr => getAttrVal(figure, attr))
      .filter(src => src != null && !src.toLowerCase().startsWith("data:"));
    const filename2Src = {};
    imgSrcs.forEach(src => {
      const groups = src.split("/");
      const filename = groups[groups.length - 1];
      filename2Src[filename] = src;
    });
    imgSrcs = Object.values(filename2Src);
    if (imgSrcs.length > 0) {
      const img = document.createElement("img");
      const suffix = GM_getValue("imageNameSuffix", "_hd.");
      let i = 0;
      while (i < imgSrcs.length && !imgSrcs[i].includes(suffix)) ++i;
      if (i === imgSrcs.length) i = 0;
      img.src = imgSrcs[i];

      if (imgSrcs.length > 1) {
        img.onclick = (() => {
          let idx = i;
          return () => {
            ++idx;
            img.src = imgSrcs[idx % imgSrcs.length];
          };
        })();

        img.onmouseover = event => {
          hint.style.display = "block";
          hint.style.top = event.clientY + "px";
          hint.style.left = event.clientX + "px";
        };

        img.onmouseleave = event => {
          hint.style.display = "none";
        };
        img.style.cursor = "pointer";
      }

      const el =
        figure.querySelector("img") || figure.querySelector("noscript");
      if (el) el.replaceWith(img);
      else figure.prepend(img);
    }
  }

  // enable all gifs and load images
  function loadAllFigures(el) {
    const figures = el.querySelectorAll("figure");
    figures.forEach(figure => {
      const gifDiv = figure.querySelector("div.RichText-gifPlaceholder");
      if (gifDiv !== null) enableGIF(gifDiv);
      else loadImage(figure);

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

  function postprocess(el) {
    replaceVideosByLinks(el);
    loadAllFigures(el);
  }

  function injectToNav() {
    const url = window.location.href;
    if (url.includes("zhuanlan")) {
      addBtnToNav();
    } else {
      addLinkToNav();
    }
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

  GM_registerMenuCommand("图片默认高清", function() {
    GM_setValue("imageNameSuffix", "_hd.");
  });
  GM_registerMenuCommand("图片默认原图", function() {
    GM_setValue("imageNameSuffix", "_r.");
  });
})();
