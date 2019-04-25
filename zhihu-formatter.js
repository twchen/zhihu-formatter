// ==UserScript==
// @name         知乎重排for印象笔记
// @namespace    http://tampermonkey.net/
// @version      0.9
// @description  重新排版知乎的问答或者专栏，使“印象笔记·剪藏”只保存需要的内容。
// @author       twchen
// @include      https://www.zhihu.com/question/*/answer/*
// @include      https://zhuanlan.zhihu.com/p/*
// @run-at       document-idle
// @grant        GM.xmlHttpRequest
// @grant        GM_xmlhttpRequest
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
 */

(function() {
  "use strict";

  const body = document.querySelector("body");
  const httpRequest =
    typeof GM_xmlhttpRequest === "undefined"
      ? GM.xmlHttpRequest
      : GM_xmlhttpRequest;

  function addLinkToNav() {
    const nav = document.querySelector("nav.AppHeader-nav");
    const a = document.createElement("a");
    a.href = "#";
    a.text = "重排";
    a.classList.add("AppHeader-navItem");
    a.onclick = event => {
      event.preventDefault();
      formatAnswer();
    };
    nav.appendChild(a);
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
    const showMoreBtn = document.querySelector(
      "button.Button.QuestionRichText-more"
    );
    if (showMoreBtn !== null) showMoreBtn.click();
    const title = document.querySelector("h1.QuestionHeader-title");
    const detail = document.querySelector("div.QuestionHeader-detail");
    const answer = document.querySelector("div.Card.AnswerCard");

    const div = document.createElement("div");
    div.appendChild(title);
    div.appendChild(detail);

    Object.assign(div.style, {
      backgroundColor: "white",
      margin: "0.8rem 0",
      padding: "0.2rem 1rem 1rem",
      borderRadius: "2px",
      boxShadow: "0 1px 3px rgba(26,26,26,.1)"
    });

    removeAllChildren(body);

    body.appendChild(div);
    body.appendChild(answer);

    postprocess();
  }

  function formatZhuanlan() {
    const header = document.querySelector("header.Post-Header");
    const title = header.querySelector(".Post-Title");
    Object.assign(title.style, {
      fontSize: "2rem",
      fontWeight: "bold",
      marginBottom: "1rem"
    });

    const post = document.querySelector("div.Post-RichText");
    const time = document.querySelector("div.ContentItem-time");
    const topics = document.querySelector("div.Post-topicsAndReviewer");

    const div = document.createElement("div");
    const titleImage = document.querySelector("img.TitleImage");
    if (titleImage) {
      titleImage.className = "";
      titleImage.style.width = "100%";
      titleImage.style.cursor = "pointer";
      titleImage.title = "点击删除图片";
      titleImage.onclick = () => {
        div.removeChild(titleImage);
      };
      div.appendChild(titleImage);
    }
    div.append(header, post, time, topics);
    div.style.margin = "1rem";

    removeAllChildren(body);
    body.appendChild(div);

    postprocess();
  }

  function replaceVideosByLinks() {
    const videoDivs = document.querySelectorAll("div.RichText-video");
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
            message: `Status: ${response.status}. StatusText: ${
              response.statusText
            }`
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

  // enable all gifs and load images
  function loadAllFigures() {
    const figures = document.querySelectorAll("figure");
    const imgSrcAttrs = ["data-original", "data-src", "src", "data-actualsrc"];
    figures.forEach(figure => {
      const gifDiv = figure.querySelector("div.RichText-gifPlaceholder");
      if (gifDiv !== null) {
        enableGIF(gifDiv);
      } else {
        let imgSrcs = imgSrcAttrs
          .map(attr => getAttrVal(figure, attr))
          .filter(src => src != null);
        const filename2Src = {};
        imgSrcs.forEach(src => {
          const groups = src.split("/");
          const filename = groups[groups.length - 1];
          filename2Src[filename] = src;
        });
        imgSrcs = Object.values(filename2Src);
        if (imgSrcs.length > 0) {
          const img = document.createElement("img");
          img.src = imgSrcs[0];
          img.onclick = (() => {
            let i = 0;
            return () => {
              ++i;
              img.src = imgSrcs[i % imgSrcs.length];
            };
          })();
          if (imgSrcs.length > 1) {
            img.title = "点击图片换不同分辨率（如有）";
            img.style.cursor = "pointer";
          }
          removeAllChildren(figure);
          figure.appendChild(img);
        }
      }
    });
  }

  function postprocess() {
    replaceVideosByLinks();
    loadAllFigures();
  }

  function removeAllChildren(el) {
    while (el.firstChild) {
      el.removeChild(el.firstChild);
    }
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
})();
