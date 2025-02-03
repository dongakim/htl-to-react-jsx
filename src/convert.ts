import fs from "fs";
import htmlMinifier from "html-minifier";
import { parseDocument, Parser } from "htmlparser2";
import { Document, ParentNode, ChildNode } from "domhandler";
import { styleText } from "node:util";

type JSXAttributes = {
  [key: string]: string;
};

function checkParentAttrib(attrib: string, parent: ParentNode | null): boolean {
  let p: ParentNode | null = parent;
  let result: boolean = false;

  while (p) {
    if (p?.type === "tag" && p.attribs) {
      const some = Object.keys(p.attribs).some((key) => key.startsWith(attrib));

      if (some) {
        result = true;
      }
    }
    p = p.parent;
  }

  return result;
}

const convertHTLToReact = (htlCode: string): string => {
  const reactCode: string[] = [];
  const document: Document = parseDocument(htlCode, {
    lowerCaseAttributeNames: false,
  });
  const imports = new Set<string>();
  const vars: { [name: string]: any } = {};
  const props = new Set<string>();
  const child = new Set<string>();
  const stacks: any[] = [];

  const parse = (node: ChildNode | null): { body: string; jsx: string } => {
    let body = "";
    let jsx = "";

    if (!node) {
      return { body, jsx };
    }

    if (
      node.type === "tag" ||
      node.type === "script" ||
      node.type === "style"
    ) {
      const { name, attribs } = node;
      let tag = name === "sly" ? null : name;
      const attributes: JSXAttributes = {};
      let condition: null | string = null;
      let isSetHasKey: boolean = false;
      let isUnwrap: boolean = false;
      let unwrapCondition: null | string = null;

      if (node.children.length > 0) {
        const parsedChildren = node.children.map(parse);

        const filtred = parsedChildren.filter((child) => !!child.jsx);
        filtred.forEach((child) => (jsx += child.jsx));

        if (filtred.length > 1) {
          jsx = `<>${jsx}</>`;
        }

        parsedChildren.forEach((child) => {
          if (child.body) {
            body += child.body;
          }
        });
      }

      console.log(styleText("yellowBright", "[ NODE START ]"));
      let attribsForLogs = "";
      if (node.attribs) {
        for (const [key, value] of Object.entries(node.attribs)) {
          attribsForLogs += ` ${key}="${value}"`;
        }
      }
      console.log(styleText("yellowBright", `<${name} ${attribsForLogs} />`));

      if (attribs) {
        for (const [key, value] of Object.entries(attribs)) {
          if (key.startsWith("data-sly-use") && key.includes(".")) {
            console.log(styleText("yellow", "  [ USE ]"));
            console.log(styleText("yellow", "    * name:"), name);
            console.log(styleText("yellow", "    * key:"), key);
            console.log(styleText("yellow", "    * value:"), value);
            const [block, identifier] = key.split(".");
            const split = value.split(".");

            if (split[split.length - 1] === "html") {
              child.add(identifier);
            } else {
              console.log("  * identifier:", identifier);
              props.add(identifier);
            }
          } else if (key.startsWith("data-sly-test")) {
            console.log(styleText("yellow", "  [ TEST ]"));
            console.log(styleText("yellow", "    * key:"), key);
            console.log(styleText("yellow", "    * value:"), value);

            if (key.includes(".")) {
              const [block, identifier] = key.split(".");
              vars[identifier] =
                value.startsWith("$") || value.includes("$")
                  ? value.replace(/\${([^}]*)}/g, "$1")
                  : value;

              isSetHasKey = true;
            }

            condition =
              value.startsWith("$") || value.includes("$")
                ? value.replace(/\${([^}]*)}/g, "$1")
                : value;
          } else if (key.startsWith("data-sly-list")) {
            console.log(styleText("yellow", "  [ LIST ]"));
            console.log(styleText("yellow", "    * key:"), key);
            console.log(styleText("yellow", "    * value:"), value);
            const identifier = key.includes(".") ? key.split(".")[1] : "item";
            jsx = `{${value.replace(
              /\${([^}]*)}/g,
              "$1"
            )}.map((${identifier}) => ${jsx})}`;
          } else if (key.startsWith("data-sly-attribute")) {
            console.log(styleText("yellow", "  [ ATTRIBUTE ]"));
            console.log(styleText("yellow", "    * name:"), name);
            console.log(styleText("yellow", "    * key:"), key);
            console.log(styleText("yellow", "    * value:"), value);
            if (key.includes(".")) {
              const [block, identifier] = key.split(".");
              attributes[identifier] = value;
            } else {
              attributes[value] = value;
            }

            for (const [key, value] of Object.entries(attributes)) {
              console.log(styleText("yellow", `      - ${key}:`), value);
            }
          } else if (key.startsWith("data-sly-element")) {
            jsx += `<${name} ${attribsForLogs} />`;
          } else if (key.startsWith("data-sly-set") && key.includes(".")) {
            console.log(styleText("yellow", "  [ SET ]"));
            console.log(styleText("yellow", "    * key:"), key);
            console.log(styleText("yellow", "    * value:"), value);
            const [block, identifier] = key.split(".");
            const isTestAttribInParent = checkParentAttrib(
              "data-sly-test",
              node.parent
            );

            if (isTestAttribInParent) {
              vars[identifier] = "";
              body += `${identifier} = \`${value}\`;`;
            } else {
              vars[identifier] =
                value.startsWith("$") || value.includes("$")
                  ? // ? value.replace(/\${([^}]*)}/g, "$1")
                    `\`${value}\``
                  : value;
            }
          } else if (key.startsWith("data-sly-repeat")) {
            console.log(styleText("yellow", "  [ REPEAT ]"));
            console.log(styleText("yellow", "    * key:"), key);
            console.log(styleText("yellow", "    * value:"), value);
          } else if (key.startsWith("data-sly-text")) {
            console.log(styleText("yellow", "  [ TEXT ]"));
            console.log(styleText("yellow", "    * key:"), key);
            console.log(styleText("yellow", "    * value:"), value);
            jsx += `<${name} ${attribsForLogs} />`;
          } else if (key.startsWith("data-sly-include")) {
            console.log(styleText("yellow", "  [ INCLUDE ]"));
            console.log(styleText("yellow", "    * key:"), key);
            console.log(styleText("yellow", "    * value:"), value);
            jsx += `<${name} ${attribsForLogs} />`;
          } else if (key.startsWith("data-sly-resource")) {
            console.log(styleText("yellow", "  [ RESOURCE ]"));
            console.log(styleText("yellow", "    * key:"), key);
            console.log(styleText("yellow", "    * value:"), value);
            const match = value.match(/resourceType='([^']+)'/);
            const resourceType = match ? match[0] : null;

            if (resourceType) {
              imports.add(resourceType);
            }
            jsx += `<${name} ${attribsForLogs} />`;
          } else if (key.startsWith("data-sly-template")) {
            console.log(styleText("yellow", "  [ TEMPLATE ]"));
            console.log(styleText("yellow", "    * key:"), key);
            console.log(styleText("yellow", "    * value:"), value);
            jsx += `<${name} ${attribsForLogs} />`;
          } else if (key.startsWith("data-sly-call")) {
            console.log(styleText("yellow", "  [ CALL ]"));
            console.log(styleText("yellow", "    * key:"), key);
            console.log(styleText("yellow", "    * value:"), value);
            jsx += `<${name} ${attribsForLogs} />`;
          } else if (key.startsWith("data-sly-unwrap")) {
            console.log(styleText("yellow", "  [ UNWRAP ]"));
            console.log(styleText("yellow", "    * key:"), key);
            console.log(styleText("yellow", "    * value:"), value);
            if (tag) {
              isUnwrap = true;
              if (value) {
                unwrapCondition = value;
              }
            }
          } else if (key === "class") {
            attributes["className"] = value;
          } else {
            attributes[key] = value;
          }
        }

        if (tag) {
          let attr = "";
          if (Object.keys(attributes).length > 0) {
            for (const [key, value] of Object.entries(attributes)) {
              let v = value.startsWith("$")
                ? `${value.slice(1)}`
                : value.includes("$")
                ? `{\`${value}\`}`
                : `"${value}"`;
              v = v.includes("@") ? `"${v}"` : v;
              attr += ` ${key}=${v}`;
            }
          }

          if (jsx) {
            if (isUnwrap) {
              if (unwrapCondition) {
                jsx = `(${unwrapCondition}) ? ${jsx} : <${tag}${attr}>${jsx}</${tag}>`;
              }
            } else {
              jsx = `<${tag}${attr}>${jsx}</${tag}>`;

              if (condition) {
                jsx = `{${condition} && (${jsx})}`;
              }
            }
          } else {
            if (condition) {
              if (attr) {
                jsx += `{${condition} && (<${tag}${attr}></${tag}>)}`;
              } else {
                body = `if (${condition}) {${body}}`;
              }
            } else {
              if (isUnwrap) {
              } else {
                jsx += `<${tag}${attr}></${tag}>`;
              }
            }
          }
        } else {
          if (condition) {
            if (jsx) {
              jsx = `{${condition} && (${jsx})}`;
            } else {
              if (!isSetHasKey) {
                body = `if (${condition}) {${body}}`;
              }
            }
          }
        }
      }
    }

    if (node.type === "text") {
      const { data } = node;
      console.log(styleText("yellowBright", data));
      let value = data;

      value = value
        .replace("@ i18n", "/* TODO: i18n */")
        .replace("@i18n", "/* TODO: i18n */");
      value =
        value.startsWith("$") || value.includes("$")
          ? (() => {
              let cleaned = value.replace(/^["']|["']$/g, "");
              cleaned = cleaned.replace(/^\$\{(.+)\}$/, "$1");
              cleaned = cleaned.replace(/\s*@\s*[^}]+/g, "");
              cleaned = `{${cleaned}}`;
              return cleaned;
            })()
          : value;
      console.log("  * data:", value);

      jsx += value;
    }
    return { body, jsx };
  };

  reactCode.push('import React from "react";');
  imports.forEach((imp) => reactCode.push(`import "${imp}";`));
  reactCode.push("export default function ({");

  // Parse all top-level nodes
  let fnBody = "";
  let fnReturn = "";
  const parsedHTL = document.children.map(parse).forEach(({ body, jsx }) => {
    fnBody += body;
    fnReturn += jsx;
  });

  console.log(styleText("bgBlue", "props:"), props);
  console.log(styleText("bgBlue", "vars :"), vars);
  props.forEach((prop) => reactCode.push(`${prop},`));
  reactCode.push("}) {");
  for (const [key, value] of Object.entries(vars)) {
    if (value) {
      reactCode.push(`const ${key} = ${value};`);
    } else {
      reactCode.push(`let ${key};`);
    }
  }

  reactCode.push(fnBody);
  reactCode.push("return (<>");
  // reactCode.push(parsedHTL);
  // reactCode.push(content);
  reactCode.push(fnReturn);
  reactCode.push("</>);");
  reactCode.push("}");
  return reactCode.join("\n");
};

// Main function
const main = (): void => {
  const htlFilePath = "./htl-components/heroimage.html"; // Input file path
  const outputFilePath = "./output.tsx"; // Output file path

  const htlCode = fs.readFileSync(htlFilePath, "utf8");
  const minify = htmlMinifier.minify(htlCode, {
    caseSensitive: true,
    collapseWhitespace: true,
    removeComments: true,
  });
  const reactCode = convertHTLToReact(minify);
  console.log("reactCode:", reactCode);

  fs.writeFileSync(outputFilePath, reactCode, "utf8");
  new Array(10).fill("").forEach(() => {
    console.log(
      styleText(
        "bgMagentaBright",
        "React component has been successfully generated! - - - - - - - - - - - - - - -"
      )
    );
    console.log("");
  });
};

main();
