/**
 * Tree-sitter query patterns for extracting code structure across languages.
 * Used by TreeSitterProvider to extract imports, calls, and definitions.
 */

export interface LanguageQueries {
  imports: string;
  calls: string;
  definitions: string;
  inheritance?: string;
}

export const pythonQueries: LanguageQueries = {
  imports: `
    (import_statement) @import
    (import_from_statement) @import
  `,
  calls: `
    (call function: (identifier) @func)
    (call function: (attribute) @func)
  `,
  definitions: `
    (function_definition name: (identifier) @name) @def
    (class_definition name: (identifier) @name) @def
  `,
  inheritance: `
    (class_definition
      name: (identifier) @class_name
      superclasses: (argument_list (identifier) @parent))
  `,
};

export const rustQueries: LanguageQueries = {
  imports: `
    (use_declaration) @import
  `,
  calls: `
    (call_expression function: (identifier) @func)
    (call_expression function: (field_expression) @func)
  `,
  definitions: `
    (function_item name: (identifier) @name) @def
    (struct_item name: (type_identifier) @name) @def
    (enum_item name: (type_identifier) @name) @def
    (trait_item name: (type_identifier) @name) @def
    (impl_item type: (type_identifier) @name) @def
  `,
  inheritance: `
    (impl_item
      trait: (type_identifier) @trait
      type: (type_identifier) @implementor)
  `,
};

export const goQueries: LanguageQueries = {
  imports: `
    (import_declaration) @import
    (import_spec path: (interpreted_string_literal) @path)
  `,
  calls: `
    (call_expression function: (identifier) @func)
    (call_expression function: (selector_expression) @func)
  `,
  definitions: `
    (function_declaration name: (identifier) @name) @def
    (method_declaration name: (field_identifier) @name) @def
    (type_declaration (type_spec name: (type_identifier) @name)) @def
  `,
};

export const typescriptQueries: LanguageQueries = {
  imports: `
    (import_statement) @import
    (import_clause) @import
  `,
  calls: `
    (call_expression function: (identifier) @func)
    (call_expression function: (member_expression) @func)
  `,
  definitions: `
    (function_declaration name: (identifier) @name) @def
    (class_declaration name: (type_identifier) @name) @def
    (interface_declaration name: (type_identifier) @name) @def
    (method_definition name: (property_identifier) @name) @def
  `,
  inheritance: `
    (class_declaration
      name: (type_identifier) @class_name
      (class_heritage (extends_clause (identifier) @parent)))
  `,
};

/**
 * Get queries for a language by extension
 */
export function getQueriesForExtension(ext: string): LanguageQueries | null {
  switch (ext) {
    case "py":
      return pythonQueries;
    case "rs":
      return rustQueries;
    case "go":
      return goQueries;
    case "ts":
    case "tsx":
    case "js":
    case "jsx":
      return typescriptQueries;
    default:
      return null;
  }
}

/**
 * Language to WASM path mapping
 */
export const wasmPaths: Record<string, string> = {
  py: "parsers/tree-sitter-python.wasm",
  rs: "parsers/tree-sitter-rust.wasm",
  go: "parsers/tree-sitter-go.wasm",
  ts: "parsers/tree-sitter-typescript.wasm",
  tsx: "parsers/tree-sitter-tsx.wasm",
  js: "parsers/tree-sitter-javascript.wasm",
  jsx: "parsers/tree-sitter-javascript.wasm",
};
