"use client";

import * as React from "react";
import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";

type CodeMirrorEditorProps = {
  value: string;
  onChange: (value: string) => void;
  /** During streaming the editor is read-only — tokens are appended programmatically (D7). */
  readOnly?: boolean;
  fontSize?: number;
  placeholder?: string;
  className?: string;
};

// Prose, not code: wrap long lines and drop the code-editor chrome (gutters, line numbers).
const EXTENSIONS = [markdown(), EditorView.lineWrapping];

export function CodeMirrorEditor({
  value,
  onChange,
  readOnly = false,
  fontSize,
  placeholder,
  className,
}: CodeMirrorEditorProps): React.ReactElement {
  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      readOnly={readOnly}
      // editable=false also drops the DOM contenteditable, so streaming tokens can't
      // race a cursor in the document; readOnly alone keeps it focusable/selectable.
      editable={!readOnly}
      placeholder={placeholder}
      extensions={EXTENSIONS}
      theme="none"
      height="100%"
      className={className}
      style={fontSize ? { fontSize } : undefined}
      basicSetup={{
        lineNumbers: false,
        foldGutter: false,
        highlightActiveLine: !readOnly,
        highlightActiveLineGutter: false,
        highlightSelectionMatches: false,
        searchKeymap: false,
      }}
    />
  );
}
