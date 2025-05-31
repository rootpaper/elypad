class Elypad {
  constructor() {
    this.tabs = new Map();
    this.activeTabId = null;
    this.currentFolder = null;
    this.fileTree = new Map();
    this.tabCounter = 0;
    this.unsavedChanges = new Set();
    this.findDialog = null;

    this.initializeElements();
    this.setupEventListeners();
    this.setupMenuHandlers();
    this.setupFileWatcher();
    this.waitForMonaco().then(() => this.setupMonacoEditor());
  }

  waitForMonaco() {
    return new Promise((resolve) => {
      if (window.monacoLoaded && window.monaco) {
        resolve();
      } else {
        window.addEventListener('monacoLoaded', () => resolve(), { once: true });
      }
    });
  }

  initializeElements() {
    this.sidebar = document.getElementById('sidebar');
    this.fileTreeEl = document.getElementById('file-tree');
    this.tabsEl = document.getElementById('tabs');
    this.editorContainer = document.getElementById('editor-container');
    this.welcomeScreen = document.getElementById('welcome-screen');
    this.statusBar = document.getElementById('status-bar');

    this.newFileBtn = document.getElementById('new-file-btn');
    this.openFolderBtn = document.getElementById('open-folder-btn');
    this.toggleSidebarBtn = document.getElementById('toggle-sidebar-btn');

    this.welcomeNewFile = document.getElementById('welcome-new-file');
    this.welcomeOpenFile = document.getElementById('welcome-open-file');
    this.welcomeOpenFolder = document.getElementById('welcome-open-folder');

    this.cursorPosition = document.getElementById('cursor-position');
    this.fileType = document.getElementById('file-type');

    this.findDialogOverlay = document.getElementById('find-dialog-overlay');
    this.findDialog = document.getElementById('find-dialog');
    this.findInput = document.getElementById('find-input');
    this.replaceInput = document.getElementById('replace-input');
  }

  setupMonacoEditor() {
    if (!window.monaco) {
      console.error('monaco-editor not loaded');
      return;
    }

    window.monaco.editor.defineTheme('elypad-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment.lua', foreground: '666666', fontStyle: 'italic' },
        { token: 'string.lua', foreground: '98c379' },
        { token: 'number.lua', foreground: 'd19a66' },
        { token: 'keyword.lua', foreground: 'c678dd', fontStyle: 'bold' },
        { token: 'function.lua', foreground: '61afef' },
        { token: 'operator.lua', foreground: '56b6c2' },
        { token: 'punctuation.lua', foreground: 'abb2bf' }
      ],
      colors: {
        'editor.background': '#1a1a1a',
        'editor.foreground': '#e0e0e0'
      }
    });

    window.monaco.languages.register({ id: 'lua' });
    window.monaco.languages.setMonarchTokensProvider('lua', {
      keywords: ['and', 'break', 'do', 'else', 'elseif', 'end', 'false', 'for', 'function', 'goto', 'if', 'in', 'local', 'nil', 'not', 'or', 'repeat', 'return', 'then', 'true', 'until', 'while'],
      tokenizer: {
        root: [
          [/--(?:\[(=*)\[[\s\S]*?\]\1\]|.*)/, 'comment'],
          [/(["'])(?:(?!\1)[^\\\r\n]|\\z(?:\r\n|\s)|\\(?:\r\n|[\s\S]))*\1|\[(=*)\[[\s\S]*?\]\2\]/, 'string'],
          [/\b0x[a-f\d]+(?:\.[a-f\d]*)?(?:p[+-]?\d+)?\b|\b\d+(?:\.\b|(?:\.\d*)?(?:e[+-]?\d+)?\b)|\b\.\d+(?:e[+-]?\d+)?\b/i, 'number'],
          [/\b(?:and|break|do|else|elseif|end|false|for|function|goto|if|in|local|nil|not|or|repeat|return|then|true|until|while)\b/, 'keyword'],
          [/(?!\d)\w+(?=\s*(?:[({]|$))/, 'function'],
          [/[-+*%^&|#]|\/\/?|<[<=]?|>[>=]?|[=~]=?/, 'operator'],
          [/[\[\](){},;]|\.+|:+/, 'punctuation']
        ]
      }
    });

    if (this.activeTabId) {
      this.renderEditor();
    }
  }

  setupEventListeners() {
    if (this.newFileBtn) this.newFileBtn.addEventListener('click', () => this.createNewFile());
    if (this.openFolderBtn) this.openFolderBtn.addEventListener('click', () => this.openFolder());
    if (this.toggleSidebarBtn) this.toggleSidebarBtn.addEventListener('click', () => this.toggleSidebar());

    if (this.welcomeNewFile) this.welcomeNewFile.addEventListener('click', () => this.createNewFile());
    if (this.welcomeOpenFile) this.welcomeOpenFile.addEventListener('click', () => this.openFile());
    if (this.welcomeOpenFolder) this.welcomeOpenFolder.addEventListener('click', () => this.openFolder());

    const closeFindDialogBtn = document.getElementById('close-find-dialog');
    if (closeFindDialogBtn) closeFindDialogBtn.addEventListener('click', () => this.closeFindDialog());

    const findNextBtn = document.getElementById('find-next-btn');
    if (findNextBtn) findNextBtn.addEventListener('click', () => this.findNext());

    const findPrevBtn = document.getElementById('find-prev-btn');
    if (findPrevBtn) findPrevBtn.addEventListener('click', () => this.findPrevious());

    const replaceBtn = document.getElementById('replace-btn');
    if (replaceBtn) replaceBtn.addEventListener('click', () => this.replace());

    const replaceAllBtn = document.getElementById('replace-all-btn');
    if (replaceAllBtn) replaceAllBtn.addEventListener('click', () => this.replaceAll());

    document.addEventListener('keydown', (e) => this.handleKeydown(e));
    document.addEventListener('dragover', (e) => e.preventDefault());
    document.addEventListener('drop', (e) => this.handleDrop(e));
  }

  handleDrop(e) {
    e.preventDefault();
    if (!window.electronAPI) return;
    const files = e.dataTransfer.files;
    for (const file of files) {
      window.electronAPI.getFileStats(file.path).then(stats => {
        if (stats.success && stats.isDirectory) {
          this.loadFolder(file.path);
        } else if (stats.success && stats.isFile) {
          this.loadFile(file.path);
        }
      });
    }
  }

  setupMenuHandlers() {
    if (!window.electronAPI) return;

    window.electronAPI.onMenuNewFile(() => this.createNewFile());
    window.electronAPI.onMenuOpenFile(() => this.openFile());
    window.electronAPI.onMenuOpenFolder(() => this.openFolder());
    window.electronAPI.onMenuSave(() => this.saveCurrentFile());
    window.electronAPI.onMenuSaveAs(() => this.saveAsCurrentFile());
    window.electronAPI.onMenuFind(() => this.showFindDialog());
    window.electronAPI.onMenuReplace(() => this.showFindDialog());
    window.electronAPI.onMenuToggleSidebar(() => this.toggleSidebar());
  }

  setupFileWatcher() {
    if (!window.electronAPI) return;

    window.electronAPI.onFileChanged((filePath) => {
      this.handleFileChanged(filePath);
    });

    window.electronAPI.onFileAdded((filePath) => {
      this.refreshFileTree();
    });

    window.electronAPI.onFileRemoved((filePath) => {
      this.handleFileRemoved(filePath);
    });
  }

  handleKeydown(e) {
    const ctrl = e.ctrlKey || e.metaKey;

    if (ctrl && e.key === 'n') {
      e.preventDefault();
      this.createNewFile();
    } else if (ctrl && e.key === 'o' && !e.shiftKey) {
      e.preventDefault();
      this.openFile();
    } else if (ctrl && e.key === 'o' && e.shiftKey) {
      e.preventDefault();
      this.openFolder();
    } else if (ctrl && e.key === 's' && !e.shiftKey) {
      e.preventDefault();
      this.saveCurrentFile();
    } else if (ctrl && e.key === 's' && e.shiftKey) {
      e.preventDefault();
      this.saveAsCurrentFile();
    } else if (ctrl && e.key === 'f') {
      e.preventDefault();
      this.showFindDialog();
    } else if (ctrl && e.key === 'h') {
      e.preventDefault();
      this.showFindDialog();
    } else if (ctrl && e.key === 'b') {
      e.preventDefault();
      this.toggleSidebar();
    } else if (e.key === 'Escape') {
      this.closeFindDialog();
    }
  }

  async createNewFile() {
    const tabId = `tab-${++this.tabCounter}`;
    const fileName = `untitled-${this.tabCounter}`;

    const tab = {
      id: tabId,
      name: fileName,
      path: null,
      content: '',
      modified: false,
      isNew: true,
      editor: null
    };

    this.tabs.set(tabId, tab);
    this.createTabElement(tab);
    this.switchToTab(tabId);
    this.hideWelcomeScreen();
  }

  async openFile() {
    if (!window.electronAPI) {
      console.error('electron api unavailable');
      this.showError('electron api unavailable');
      return;
    }

    try {
      const result = await window.electronAPI.openFileDialog();
      if (!result.canceled && result.filePaths.length > 0) {
        const filePath = result.filePaths[0];
        await this.loadFile(filePath);
      }
    } catch (err) {
      console.error('error opening file:', err.message);
      this.showError('failed to open file');
    }
  }

  async openFolder() {
    if (!window.electronAPI) {
      console.error('electron api unavailable');
      this.showError('electron api unavailable');
      return;
    }

    try {
      const result = await window.electronAPI.openFolderDialog();
      if (!result.canceled && result.filePaths.length > 0) {
        const folderPath = result.filePaths[0];
        await this.loadFolder(folderPath);
      }
    } catch (err) {
      console.error('error opening folder:', err.message);
      this.showError('failed to open folder');
    }
  }

  async loadFile(filePath) {
    if (!window.electronAPI) {
      console.error('electron api unavailable');
      this.showError('electron api unavailable');
      return;
    }

    for (const [tabId, tab] of this.tabs) {
      if (tab.path === filePath) {
        this.switchToTab(tabId);
        return;
      }
    }

    try {
      const result = await window.electronAPI.readFile(filePath);
      if (result.success) {
        const tabId = `tab-${++this.tabCounter}`;
        const fileName = filePath.split(/[\\/]/).pop();

        const tab = {
          id: tabId,
          name: fileName,
          path: filePath,
          content: result.content,
          modified: false,
          isNew: false,
          editor: null
        };

        this.tabs.set(tabId, tab);
        this.createTabElement(tab);
        this.switchToTab(tabId);
        this.hideWelcomeScreen();
      } else {
        this.showError('failed to open file: ' + result.error);
      }
    } catch (err) {
      console.error('error loading file:', err.message);
      this.showError('failed to open file');
    }
  }

  async loadFolder(folderPath) {
    this.currentFolder = folderPath;
    await this.refreshFileTree();
    if (window.electronAPI) {
      try {
        await window.electronAPI.watchDirectory(folderPath);
      } catch (err) {
        console.error('error watching directory:', err.message);
        this.showError('failed to watch folder');
      }
    }
  }

  async refreshFileTree() {
    if (!this.currentFolder) return;

    if (!window.electronAPI) {
      console.error('electron api unavailable');
      this.showError('electron api unavailable');
      return;
    }

    try {
      const result = await window.electronAPI.readDirectory(this.currentFolder);
      if (result.success) {
        this.fileTree.clear();
        this.renderFileTree(result.items, this.currentFolder);
      } else {
        this.showError('failed to read folder: ' + result.error);
      }
    } catch (err) {
      console.error('error reading directory:', err.message);
      this.showError('failed to read folder');
    }
  }

  renderFileTree(items, parentPath, container = this.fileTreeEl) {
    container.innerHTML = '';

    items.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });

    items.forEach(item => {
      const itemEl = document.createElement('div');
      itemEl.className = `tree-item ${item.isDirectory ? 'directory' : 'file'}`;

      if (!item.isDirectory && item.name.endsWith('.lua')) {
        itemEl.classList.add('lua');
      }

      itemEl.innerHTML = `
        <img src="icons/${item.isDirectory ? 'directory' : (item.name.endsWith('.lua') ? 'lua-file' : 'file')}.svg" alt="${item.isDirectory ? 'folder' : 'file'}" class="icon">
        <div class="name">${item.name}</div>
      `;

      if (item.isDirectory) {
        itemEl.addEventListener('click', async (e) => {
          e.stopPropagation();
          await this.toggleDirectory(itemEl, item.path);
        });
      } else {
        itemEl.addEventListener('click', async (e) => {
          e.stopPropagation();
          await this.loadFile(item.path);
        });
      }

      container.appendChild(itemEl);
      this.fileTree.set(item.path, { element: itemEl, item });
    });
  }

  async toggleDirectory(element, dirPath) {
    if (!window.electronAPI) {
      console.error('electron api unavailable');
      this.showError('electron api unavailable');
      return;
    }

    if (element.classList.contains('expanded')) {
      element.classList.remove('expanded');
      const children = element.nextElementSibling;
      if (children && children.classList.contains('tree-children')) {
        children.remove();
      }
      element.querySelector('.icon').src = 'icons/directory.svg';
    } else {
      element.classList.add('expanded');

      try {
        const result = await window.electronAPI.readDirectory(dirPath);
        if (result.success) {
          const childrenContainer = document.createElement('div');
          childrenContainer.className = 'tree-children';
          element.parentNode.insertBefore(childrenContainer, element.nextElementSibling);
          this.renderFileTree(result.items, dirPath, childrenContainer);
          element.querySelector('.icon').src = 'icons/directory-expanded.svg';
        } else {
          this.showError('failed to read folder: ' + result.error);
        }
      } catch (err) {
        console.error('error reading directory:', err.message);
        this.showError('failed to read folder');
      }
    }
  }

  createTabElement(tab) {
    const tabEl = document.createElement('div');
    tabEl.className = 'tab';
    tabEl.dataset.tabId = tab.id;

    tabEl.innerHTML = `
      <div class="name">${tab.name}</div>
      <div class="close">×</div>
    `;

    tabEl.addEventListener('click', (e) => {
      if (!e.target.classList.contains('close')) {
        this.switchToTab(tab.id);
      }
    });

    tabEl.querySelector('.close').addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeTab(tab.id);
    });

    this.tabsEl.appendChild(tabEl);
  }

  switchToTab(tabId) {
    document.querySelectorAll('.tab').forEach(tab => {
      tab.classList.remove('active');
    });

    const tabEl = document.querySelector(`[data-tab-id="${tabId}"]`);
    if (tabEl) {
      tabEl.classList.add('active');
    }

    this.activeTabId = tabId;
    if (window.monacoLoaded && window.monaco) {
      this.renderEditor();
    } else {
      console.warn('monaco-editor not loaded, deferring editor render');
      window.addEventListener('monacoLoaded', () => this.renderEditor(), { once: true });
    }
    this.updateStatusBar();
  }

  closeTab(tabId) {
    const tab = this.tabs.get(tabId);
    if (!tab) return;

    if (tab.modified) {
      const save = confirm(`save changes to ${tab.name}?`);
      if (save) {
        this.saveFile(tab);
      }
    }

    const tabEl = document.querySelector(`[data-tab-id="${tabId}"]`);
    if (tabEl) {
      tabEl.remove();
    }

    if (tab.editor) {
      tab.editor.dispose();
    }

    this.tabs.delete(tabId);
    this.unsavedChanges.delete(tabId);

    if (this.activeTabId === tabId) {
      const remainingTabs = Array.from(this.tabs.keys());
      if (remainingTabs.length > 0) {
        this.switchToTab(remainingTabs[0]);
      } else {
        this.activeTabId = null;
        this.showWelcomeScreen();
      }
    }
  }

  renderEditor() {
    const tab = this.tabs.get(this.activeTabId);
    if (!tab || !window.monaco) {
      console.error('cannot render editor: tab or monaco undefined');
      return;
    }

    this.editorContainer.innerHTML = '';

    const editorWrapper = document.createElement('div');
    editorWrapper.className = 'editor-with-numbers';
    editorWrapper.style.height = '100%';

    this.editorContainer.appendChild(editorWrapper);

    try {
      tab.editor = window.monaco.editor.create(editorWrapper, {
        value: tab.content,
        language: tab.name.endsWith('.lua') ? 'lua' : 'plaintext',
        theme: 'elypad-dark',
        automaticLayout: true,
        lineNumbers: 'on',
        scrollBeyondLastLine: false,
        minimap: { enabled: false },
        fontFamily: 'sf mono, monaco, cascadia code, roboto mono, consolas, courier new, monospace',
        fontSize: 13,
        lineHeight: 1.5,
        tabSize: 2
      });

      tab.editor.onDidChangeModelContent(() => {
        tab.content = tab.editor.getValue();
        this.markTabAsModified(tab.id);
        this.updateStatusBar();
      });

      tab.editor.onKeyDown((e) => {
        if (e.keyCode === window.monaco.KeyCode.Tab) {
          e.preventDefault();
          const position = tab.editor.getPosition();
          tab.editor.executeEdits('', [{
            range: new window.monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
            text: '  '
          }]);
          tab.editor.setPosition({ lineNumber: position.lineNumber, column: position.column + 2 });
          tab.content = tab.editor.getValue();
          this.markTabAsModified(tab.id);
        }
      });

      tab.editor.onDidScrollChange(() => {
        this.updateStatusBar();
      });

      tab.editor.onMouseDown(() => {
        this.updateStatusBar();
      });

      tab.editor.onKeyUp(() => {
        this.updateStatusBar();
      });

      tab.editor.focus();
    } catch (err) {
      console.error('error creating editor:', err.message);
      this.showError('failed to create editor');
    }
  }

  markTabAsModified(tabId) {
    const tab = this.tabs.get(tabId);
    if (!tab) return;

    if (!tab.modified) {
      tab.modified = true;
      this.unsavedChanges.add(tabId);

      const tabEl = document.querySelector(`[data-tab-id="${tabId}"]`);
      if (tabEl) {
        tabEl.classList.add('modified');
      }
    }
  }

  async saveCurrentFile() {
    if (!this.activeTabId) return;

    const tab = this.tabs.get(this.activeTabId);
    if (!tab) return;

    if (tab.isNew || !tab.path) {
      await this.saveAsCurrentFile();
    } else {
      await this.saveFile(tab);
    }
  }

  async saveAsCurrentFile() {
    if (!this.activeTabId || !window.electronAPI) return;

    const tab = this.tabs.get(this.activeTabId);
    if (!tab) return;

    try {
      const result = await window.electronAPI.saveFileDialog();
      if (!result.canceled && result.filePath) {
        tab.path = result.filePath;
        tab.name = result.filePath.split(/[\\/]/).pop();
        tab.isNew = false;

        await this.saveFile(tab);

        const tabEl = document.querySelector(`[data-tab-id="${tab.id}"]`);
        if (tabEl) {
          tabEl.querySelector('.name').textContent = tab.name;
        }
      }
    } catch (err) {
      console.error('error saving file:', err.message);
      this.showError('failed to save file');
    }
  }

  async saveFile(tab) {
    if (!tab.path || !window.electronAPI) return;

    try {
      const result = await window.electronAPI.writeFile(tab.path, tab.content);
      if (result.success) {
        tab.modified = false;
        this.unsavedChanges.delete(tab.id);

        const tabEl = document.querySelector(`[data-tab-id="${tab.id}"]`);
        if (tabEl) {
          tabEl.classList.remove('modified');
        }

        this.showStatus('file saved successfully');
      } else {
        this.showError('failed to save file: ' + result.error);
      }
    } catch (err) {
      console.error('error saving file:', err.message);
      this.showError('failed to save file');
    }
  }

  showFindDialog() {
    this.findDialogOverlay.classList.add('show');
    this.findInput.focus();
  }

  closeFindDialog() {
    this.findDialogOverlay.classList.remove('show');
  }

  findNext() {
    const searchTerm = this.findInput.value;
    if (!searchTerm) return;

    const tab = this.tabs.get(this.activeTabId);
    if (!tab || !tab.editor) return;

    const searchResult = tab.editor.getModel().findNextMatch(
      searchTerm,
      tab.editor.getPosition(),
      false,
      true,
      null,
      true
    );

    if (searchResult) {
      tab.editor.setSelection(searchResult.range);
      tab.editor.revealLine(searchResult.range.startLine);
      tab.editor.focus();
    } else {
      const firstResult = tab.editor.getModel().findNextMatch(
        searchTerm,
        { lineNumber: 1, column: 1 },
        false,
        true,
        null,
        true
      );
      if (firstResult) {
        tab.editor.setSelection(firstResult.range);
        tab.editor.revealLine(firstResult.range.startLine);
        tab.editor.focus();
      }
    }
  }

  findPrevious() {
    const searchTerm = this.findInput.value;
    if (!searchTerm) return;

    const tab = this.tabs.get(this.activeTabId);
    if (!tab || !tab.editor) return;

    const searchResult = tab.editor.getModel().findPreviousMatch(
      searchTerm,
      tab.editor.getPosition(),
      false,
      true,
      null,
      true
    );

    if (searchResult) {
      tab.editor.setSelection(searchResult.range);
      tab.editor.revealLine(searchResult.range.startLine);
      tab.editor.focus();
    } else {
      const lastResult = tab.editor.getModel().findPreviousMatch(
        searchTerm,
        { lineNumber: tab.editor.getModel().getLineCount(), column: tab.editor.getModel().getLineContent(tab.editor.getModel().getLineCount()).length + 1 },
        false,
        true,
        null,
        true
      );
      if (lastResult) {
        tab.editor.setSelection(lastResult.range);
        tab.editor.revealLine(lastResult.range.startLine);
        tab.editor.focus();
      }
    }
  }

  replace() {
    const tab = this.tabs.get(this.activeTabId);
    if (!tab || !tab.editor) return;

    const searchTerm = this.findInput.value;
    const replaceTerm = this.replaceInput.value;

    const selection = tab.editor.getSelection();
    if (!selection.isEmpty()) {
      const selectedText = tab.editor.getModel().getValueInRange(selection);
      if (selectedText === searchTerm) {
        tab.editor.executeEdits('', [{
          range: selection,
          text: replaceTerm
        }]);
        tab.content = tab.editor.getValue();
        this.markTabAsModified(tab.id);
      }
    }
  }

  replaceAll() {
    const tab = this.tabs.get(this.activeTabId);
    if (!tab || !tab.editor) return;

    const searchTerm = this.findInput.value;
    const replaceTerm = this.replaceInput.value;

    if (!searchTerm) return;

    const matches = tab.editor.getModel().findMatches(searchTerm, true, false, true, null, true);
    tab.editor.getModel().pushStackElement();
    matches.forEach(match => {
      tab.editor.executeEdits('', [{
        range: match.range,
        text: replaceTerm
      }]);
    });
    tab.content = tab.editor.getValue();
    this.markTabAsModified(tab.id);
  }

  toggleSidebar() {
    this.sidebar.classList.toggle('collapsed');
  }

  updateStatusBar() {
    const tab = this.tabs.get(this.activeTabId);
    if (!tab || !tab.editor) {
      this.cursorPosition.textContent = 'line 1, column 1';
      this.fileType.textContent = 'plain text';
      return;
    }

    const position = tab.editor.getPosition();
    this.cursorPosition.textContent = `line ${position.lineNumber}, column ${position.column}`;

    if (tab.name.endsWith('.lua')) {
      this.fileType.textContent = 'lua';
    } else {
      this.fileType.textContent = 'plain text';
    }
  }

  hideWelcomeScreen() {
    this.welcomeScreen.style.display = 'none';
  }

  showWelcomeScreen() {
    this.welcomeScreen.style.display = 'flex';
    this.editorContainer.innerHTML = '';
    this.editorContainer.appendChild(this.welcomeScreen);
  }

  showStatus(message) {
    console.log('status:', message);
  }

  showError(message) {
    console.error('error:', message);
    alert('error: ' + message);
  }

  handleFileChanged(filePath) {
    for (const [tabId, tab] of this.tabs) {
      if (tab.path === filePath) {
        console.log('file changed externally:', filePath);
        break;
      }
    }
  }

  handleFileRemoved(filePath) {
    for (const [tabId, tab] of this.tabs) {
      if (tab.path === filePath) {
        this.closeTab(tabId);
        break;
      }
    }
    this.refreshFileTree();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new Elypad();
});