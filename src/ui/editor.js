import { EditorView, basicSetup } from "codemirror";
import { html } from "@codemirror/lang-html";
import {
  wrapInsideTag,
  replaceSelectionByHtml,
  wrapInsideLink,
  clearSelectionStyle,
  cleanPastedHtml,
} from "../core/edit.js";
import { hasTagName } from "../core/dom.js";
import { EditorModes } from "../core/mode.js";
import { Events } from "../core/event.js";
import { getSelection, restoreSelection } from "../core/range.js";
import { EdithModal, createInputModalField, createCheckboxModalField } from "./modal.js";

function EdithEditor(ctx, options) {
  this.ctx = ctx;
  this.content = options.initialContent || "";
  this.height = options.height || 80;
  this.mode = EditorModes.Visual;
  this.editors = {};
  this.codeMirror = null;
}

EdithEditor.prototype.render = function () {
  // Create a wrapper for the editor
  const editorWrapper = document.createElement("div");
  editorWrapper.setAttribute("class", "edith-editing-area");
  editorWrapper.setAttribute("style", `height: ${this.height}px`);

  // Create the visual editor
  this.editors.visual = document.createElement("div");
  this.editors.visual.setAttribute("class", "edith-visual");
  this.editors.visual.setAttribute("contenteditable", "true");
  this.editors.visual.innerHTML = this.content;
  editorWrapper.append(this.editors.visual);

  // Create the code editor
  this.editors.code = document.createElement("div");
  this.editors.code.setAttribute("class", "edith-code edith-hidden");
  editorWrapper.append(this.editors.code);

  // Bind events
  const keyEventsListener = this.onKeyEvent.bind(this);
  this.editors.visual.addEventListener("keydown", keyEventsListener);
  this.editors.visual.addEventListener("keyup", keyEventsListener);
  const pasteEventListener = this.onPasteEvent.bind(this);
  this.editors.visual.addEventListener("paste", pasteEventListener);

  // Return the wrapper
  return editorWrapper;
};

EdithEditor.prototype.setContent = function (content) {
  // Check the current mode
  if (this.mode === EditorModes.Visual) {
    // Update the visual editor content
    this.editors.visual.innerHTML = content;
  } else {
    // Update the code editor content
    this.codeMirror.dispatch({
      changes: { from: 0, to: this.codeMirror.state.doc.length, insert: content },
    });
  }
};

EdithEditor.prototype.getContent = function () {
  // Check the current mode
  if (this.mode === EditorModes.Visual) {
    // Return the visual editor content
    return this.editors.visual.innerHTML;
  } else {
    // Return the code editor content
    this.editors.code.classList.add("edith-hidden");

    // Display the visual editor
    return this.codeMirror.state.doc
      .toJSON()
      .map((line) => line.trim())
      .join("\n");
  }
};

EdithEditor.prototype.wrapInsideTag = function (tag) {
  wrapInsideTag(tag);
};

EdithEditor.prototype.replaceByHtml = function (html) {
  replaceSelectionByHtml(html);
};

EdithEditor.prototype.clearStyle = function () {
  clearSelectionStyle();
};

EdithEditor.prototype.insertLink = function () {
  // Get the caret position
  const { sel, range } = getSelection();

  // Show the modal
  const modal = new EdithModal(this.ctx, {
    title: "Insérer un lien",
    fields: [
      createInputModalField("Texte à afficher", "text", range.toString()),
      createInputModalField("URL du lien", "href"),
      createCheckboxModalField("Ouvrir dans une nouvelle fenêtre", "openInNewTab", true),
    ],
    callback: (data) => {
      // Check if we have something
      if (data === null) {
        // Nothing to do
        return;
      }

      // Restore the selection
      restoreSelection({ sel, range });

      // Insert a link
      wrapInsideLink(data.text, data.href, data.openInNewTab);
    },
  });
  modal.show();
};

EdithEditor.prototype.toggleCodeView = function () {
  // Check the current mode
  if (this.mode === EditorModes.Visual) {
    // Switch mode
    this.mode = EditorModes.Code;

    // Hide the visual editor
    this.editors.visual.classList.add("edith-hidden");

    // Display the code editor
    this.editors.code.classList.remove("edith-hidden");
    const codeMirrorEl = document.createElement("div");
    this.editors.code.append(codeMirrorEl);
    this.codeMirror = new EditorView({
      doc: this.editors.visual.innerHTML,
      extensions: [basicSetup, EditorView.lineWrapping, html({ matchClosingTags: true, autoCloseTags: true })],
      parent: codeMirrorEl,
    });
  } else {
    // Switch mode
    this.mode = EditorModes.Visual;

    // Hide the code editor
    this.editors.code.classList.add("edith-hidden");

    // Display the visual editor
    this.editors.visual.classList.remove("edith-hidden");
    this.editors.visual.innerHTML = this.codeMirror.state.doc
      .toJSON()
      .map((line) => line.trim())
      .join("\n");
    this.codeMirror.destroy();
    this.codeMirror = null;
    this.editors.code.innerHTML = "";
  }

  // Trigger an event with the new mode
  this.ctx.trigger(Events.modeChanged, { mode: this.mode });
};

EdithEditor.prototype.onKeyEvent = function (e) {
  // Check if a Meta key is pressed
  const prevent = e.metaKey || e.ctrlKey ? this._processKeyEventWithMeta(e) : this._processKeyEvent(e);

  // Check if we must stop the event here
  if (prevent) {
    e.preventDefault();
    e.stopPropagation();
  }
};

EdithEditor.prototype._processKeyEvent = function (e) {
  // Check the key code
  switch (e.keyCode) {
    // Enter : 13
    case 13:
      if (e.type === "keydown") {
        // Insert a line break
        replaceSelectionByHtml("<br />");
      }

      // Return true
      return true;
  }

  // Return false
  return false;
};

EdithEditor.prototype._processKeyEventWithMeta = function (e) {
  // Check the key code
  switch (e.keyCode) {
    // Space : 32
    case 32:
      if (e.type === "keydown") {
        // Insert a non-breaking space
        replaceSelectionByHtml('<span class="wysiwyg-nbsp" contenteditable="false">¶</span>');
      }

      // Return true
      return true;
  }

  // Return false
  return false;
};

EdithEditor.prototype.onPasteEvent = function (e) {
  // Prevent default
  e.preventDefault();
  e.stopPropagation();

  // Get the caret position
  const { sel, range } = getSelection();

  // Check if we try to paste HTML content
  if (!e.clipboardData.types.includes("text/html")) {
    // Get the content as a plain text
    const text = e.clipboardData.getData("text/plain").replace(/[\r\n]+/g, "<br />");

    // Check if the user want to replace the selection
    if (range && !range.collapsed && range.commonAncestorContainer.nodeType === Node.TEXT_NODE) {
      // Delete the Current Selection
      range.deleteContents();
    }

    // Insert the text
    range.insertNode(document.createTextNode(text));

    // Nothing more to do
    return;
  }

  // Detect style blocs in parents
  let dest = sel.anchorNode;
  const style = { B: false, I: false, U: false, S: false, Q: false };
  while (!dest.parentNode.classList.contains("edith-visual")) {
    // Get the parent
    dest = dest.parentNode;

    // Check if it's a style tag
    if (hasTagName(dest, ["b", "i", "u", "s", "q"])) {
      // Update the style
      style[dest.tagName] = true;
    }
  }

  // We have HTML content
  let html = e.clipboardData.getData("text/html").replace(/[\r\n]+/g, " ");

  // Wrap the HTML Content into <html><body></body></html>
  if (!/^<html>\s*<body>/.test(html)) {
    html = "<html><body>" + html + "</body></html>";
  }

  // Clean the Content
  const contents = cleanPastedHtml(html, style);

  // Check if the user want to replace the selection
  if (range && !range.collapsed && range.commonAncestorContainer.nodeType === Node.TEXT_NODE) {
    // Delete the Current Selection
    range.deleteContents();
  }

  // Paste the Content into the Editor Content
  const frag = document.createDocumentFragment();
  frag.append(...contents.childNodes);
  range.insertNode(frag);
};

EdithEditor.prototype.destroy = function () {
  // Check the current mode
  if (this.mode === EditorModes.Visual) {
    // Remove the visual editor
    this.editors.visual.remove();
  } else {
    // Remove the code editor
    this.codeMirror.destroy();
    this.codeMirror = null;
    this.editors.code.remove();
  }
};

export { EdithEditor };
