import * as vscode from 'vscode';
import {
  resolveDataAccessToExtensionJson,
  resolveExtensionJsonDefinition,
  resolveMapDataToExtensionJson,
} from './extensionJsonResolve';
import { resolveTeeWidgetDefinition } from './resolveDefinition';
import {
  getVueTagNameAtPosition,
  shouldSkipTag,
  tagToWidgetPascal,
} from './widgetResolver';

async function goToDefinitionAtCursor(
  editor: vscode.TextEditor
): Promise<void> {
  const { document, selection } = editor;
  const pos = selection.active;

  if (document.languageId === 'vue') {
    const mapLocs = await resolveMapDataToExtensionJson(document, pos);
    if (mapLocs?.length) {
      await vscode.window.showTextDocument(mapLocs[0].uri, {
        selection: mapLocs[0].range,
      });
      return;
    }
  }

  if (document.languageId === 'vue') {
    const dataLocs = await resolveDataAccessToExtensionJson(document, pos);
    if (dataLocs?.length) {
      await vscode.window.showTextDocument(dataLocs[0].uri, {
        selection: dataLocs[0].range,
      });
      return;
    }
  }

  if (document.languageId === 'vue') {
    const tag = getVueTagNameAtPosition(document, pos);
    if (tag && !shouldSkipTag(tag)) {
      const widgetPascal = tagToWidgetPascal(tag);
      const locs = await resolveTeeWidgetDefinition(document.uri, widgetPascal);
      if (locs?.length) {
        if (locs.length === 1) {
          await vscode.window.showTextDocument(locs[0].uri, {
            selection: locs[0].range,
          });
        } else {
          const picked = await vscode.window.showQuickPick(
            locs.map((l) => ({
              label: l.uri.fsPath,
              location: l,
            })),
            { placeHolder: '多个 extension 提供了同名 widget，请选择' }
          );
          if (picked?.location) {
            await vscode.window.showTextDocument(picked.location.uri, {
              selection: picked.location.range,
            });
          }
        }
        return;
      }
    }
  }

  if (document.fileName.endsWith('extension.json')) {
    const jsonLocs = await resolveExtensionJsonDefinition(document, pos);
    if (jsonLocs?.length) {
      await vscode.window.showTextDocument(jsonLocs[0].uri, {
        selection: jsonLocs[0].range,
      });
      return;
    }
  }

  void vscode.window.showInformationMessage(
    'Ranta：未解析到跳转目标（Vue 上可试 data.xxx / widget 标签；extension.json 上可试 provide 中的字符串）。'
  );
}

export function activate(context: vscode.ExtensionContext): void {
  const vueSelector: vscode.DocumentSelector = [
    { language: 'vue', scheme: 'file' },
  ];

  const jsonSelector: vscode.DocumentSelector = [
    { pattern: '**/extensions/**/extension.json', scheme: 'file' },
  ];

  const vueDef = vscode.languages.registerDefinitionProvider(vueSelector, {
    async provideDefinition(
      document: vscode.TextDocument,
      position: vscode.Position
    ): Promise<vscode.Definition | vscode.LocationLink[]> {
      const mapLocs = await resolveMapDataToExtensionJson(document, position);
      if (mapLocs?.length) {
        return mapLocs;
      }
      const dataLocs = await resolveDataAccessToExtensionJson(
        document,
        position
      );
      if (dataLocs?.length) {
        return dataLocs;
      }
      const tag = getVueTagNameAtPosition(document, position);
      if (!tag || shouldSkipTag(tag)) {
        return [];
      }
      const widgetPascal = tagToWidgetPascal(tag);
      const locs = await resolveTeeWidgetDefinition(document.uri, widgetPascal);
      return locs ?? [];
    },
  });

  const jsonDef = vscode.languages.registerDefinitionProvider(jsonSelector, {
    async provideDefinition(
      document: vscode.TextDocument,
      position: vscode.Position
    ): Promise<vscode.Definition | vscode.LocationLink[]> {
      const locs = await resolveExtensionJsonDefinition(document, position);
      return locs ?? [];
    },
  });

  const cmd = vscode.commands.registerTextEditorCommand(
    'ranta.goToWidget',
    async (editor) => {
      await goToDefinitionAtCursor(editor);
    }
  );

  context.subscriptions.push(vueDef, jsonDef, cmd);
}

export function deactivate(): void {}
