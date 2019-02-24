// ==UserScript==
// @name         Stack Exchange Formatter
// @namespace    https://greasyfork.org/en/users/211578
// @version      0.1
// @description  Format contents on Stack Enchange websites such as stackoverflow.com and askubuntu.com for easy saving to Evernote.
// @author       twchen
// @include      https://stackoverflow.com/questions/*
// @include      https://*.stackexchange.com/questions/*
// @include      https://superuser.com/questions/*
// @include      https://serverfault.com/questions/*
// @include      https://askubuntu.com/questions/*
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";
  const description = document.querySelector("#question .postcell .post-text");
  const body = document.body;
  let saveDesc = true;
  const answersToSave = [];

  function addLinks() {
    const answers = document.querySelectorAll(".answer > .post-layout");
    answers.forEach(ans => {
      const text = ans.querySelector(".answercell .post-text");
      const menu = ans.querySelector(".post-menu");
      const saveAnsLink = document.createElement("a");
      saveAnsLink.href = "#";
      saveAnsLink.text = 'save this answer';
      saveAnsLink.onclick = event => {
        event.preventDefault();
        answersToSave.push(text);
        saveDesc = false;
        save();
      };
      const saveQALink = document.createElement('a');
      saveQALink.href = '#';
      saveQALink.text = 'save Q&A';
      saveQALink.onclick = event => {
        event.preventDefault();
        answersToSave.push(text);
        save();
      };
      menu.append(saveAnsLink, saveQALink);
    });

    const div = document.createElement('div');
    div.classList.add('pl8', 'aside-cta', 'grid--cell');
    const chooseLink = document.createElement('a');
    chooseLink.href = "#";
    chooseLink.classList.add("d-inline-flex", "ai-center", "ws-nowrap", "s-btn", "s-btn__primary");
    chooseLink.text = "Save Multiple Answers";
    chooseLink.onclick = event => {
      event.preventDefault();
      startChoosing();
    };
    div.appendChild(chooseLink);
    const header = document.querySelector('#question-header');
    header.append(div);
  }

  function startChoosing() {
    const votingContainers = document.querySelectorAll('.js-voting-container');
    votingContainers.forEach((container, i) => {
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = `checkbox${i}`;
      checkbox.style.margin = 'auto';
      const label = document.createElement('label');
      label.htmlFor = `checkbox${i}`;
      label.innerText = 'Keep';
      label.style.margin = 'auto';
      container.prepend(checkbox, label);
    });

    const doneButton = document.createElement('button');
    doneButton.innerText = "Done";
    Object.assign(doneButton.style, {
      position: 'fixed',
      right: '2rem',
      top: '50%',
      zIndex: '100'
    });
    doneButton.onclick = event => {
      event.preventDefault();
      doneChoosing();
    };
    body.appendChild(doneButton);
  }

  function doneChoosing() {
    const question = document.querySelector('#question');
    const questionCheckbox = question.querySelector('.js-voting-container input[type="checkbox"]');
    saveDesc = questionCheckbox.checked;
    const answers = document.querySelectorAll(".answer > .post-layout");
    answers.forEach(ans => {
      const text = ans.querySelector(".answercell .post-text");
      const checkbox = ans.querySelector(".js-voting-container input[type='checkbox']");
      if (checkbox.checked) {
        answersToSave.push(text);
      }
    });
    if (answersToSave.length == 0) {
      alert('Choose at least one answer to save!');
    } else {
      save();
    }

  }

  function save() {
    removeAllChildren(body);
    const div = document.createElement("div");
    div.style.margin = 'auto';
    if (saveDesc) {
      div.appendChild(description);
    }
    answersToSave.forEach(ans => {
      const hr = document.createElement("hr");
      hr.style.height = '3px';
      hr.style.marginTop = '4rem';
      div.appendChild(hr);
      div.appendChild(ans);
    });
    body.appendChild(div);
  }

  function removeAllChildren(el) {
    while (el.firstChild) {
      el.removeChild(el.firstChild);
    }
  }

  addLinks();
})();