// ==UserScript==
// @name         知乎重排for印象笔记
// @namespace    http://tampermonkey.net/
// @version      0.5
// @description  增加一个“重排”链接于导航栏，点击后重排页面，只保留有用内容，然后可用“印象笔记·剪藏”收藏。使用前请先看下面注意事项和使用步骤
// @author       twchen
// @include      https://www.zhihu.com/question/*/answer/*
// @include      https://zhuanlan.zhihu.com/p/*
// @run-at       document-idle
// @grant        GM.xmlHttpRequest
// @grant        GM_xmlhttpRequest
// @connect      lens.zhihu.com
// @supportURL   https://twchen.github.io/zhihu-formatter
// ==/UserScript==

(function() {
  "use strict";

  const body = document.querySelector("body");
  const httpRequest = GM.xmlHttpRequest || GM_xmlhttpRequest;

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

  function getAttributeValueOfAnyDOM(root, attr) {
    const el = root.querySelector(`*[${attr}]`);
    return el ? el.getAttribute(attr) : null;
  }

  // enable all gifs and load images
  function loadAllFigures() {
    const figures = document.querySelectorAll("figure");
    figures.forEach(figure => {
      const gifDiv = figure.querySelector("div.RichText-gifPlaceholder");
      if (gifDiv !== null) {
        enableGIF(gifDiv);
      } else {
        const original = getAttributeValueOfAnyDOM(figure, "data-original");
        const dataSrc = getAttributeValueOfAnyDOM(figure, "data-src");
        const acturalSrc = getAttributeValueOfAnyDOM(figure, "data-actualsrc");
        const src = getAttributeValueOfAnyDOM(figure, "src");
        const imgSrc = original || dataSrc || acturalSrc || src;
        if (imgSrc) {
          const img = document.createElement("img");
          img.src = imgSrc;
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
