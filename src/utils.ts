import {
  Document as YamlDoc,
  Pair,
  Pair as YAMLPair,
  Scalar,
  YAMLMap,
  YAMLSeq,
  isMap,
  isSeq,
  parseDocument as parseYamlDoc,
  stringify as stringifyYaml,
} from "yaml";
import { Element, Node, Root, element, root, text } from "@segmsh/core";

const createElement = element as (...args: any[]) => Element;

export const enum HastTypeNames {
  root = "root",
  element = "element",
  text = "text",
}

const enum NodeTypeNames {
  yaml = "yaml",
}

type YamlAstNode = Node & {
  children?: Node[];
  data?: Record<string, any>;
  properties?: Record<string, any>;
  tagName?: string;
  value?: string;
};

type YamlProperties = {
  kind?: string;
  typeof?: string;
  yaml?: Record<string, any>;
};

const YAML_SEQUENCE_TAGS = new Set(["ul", "ol", "li"]);

function asYamlNode(node: Node): YamlAstNode {
  return node as YamlAstNode;
}

function isElement(node: Node, tagName?: string): node is Element {
  return node.type === "element" && (!tagName || asYamlNode(node).tagName === tagName);
}

function hasTagName(node: Node, tagName: string): boolean {
  return asYamlNode(node).tagName === tagName;
}

function isRoot(node: Node): node is Root {
  return node.type === HastTypeNames.root;
}

function isText(node: Node): boolean {
  return node.type === HastTypeNames.text;
}

function isSequenceElement(node: Node): node is Element {
  return isElement(node) && YAML_SEQUENCE_TAGS.has(node.tagName);
}

function getFirstChild(node: Node): Node | undefined {
  return asYamlNode(node).children?.[0];
}

function getProperties(node: Node): YamlProperties {
  return (asYamlNode(node).properties ?? {}) as YamlProperties;
}

function getYamlProperties(node: Node): Record<string, any> | undefined {
  return getProperties(node).yaml;
}

function assignProperties(target: Record<string, any>, properties?: Record<string, any>): void {
  if (!properties) return;

  for (const [key, value] of Object.entries(properties)) {
    target[key] = value;
  }
}

function scalarValue(value: string, sourceType?: string): string | number | boolean {
  if (sourceType === "boolean") return value === "true";
  if (sourceType === "number") return Number(value);
  return value;
}

function sequenceItemNode(node: Element): Node {
  const firstChild = getFirstChild(node);

  if (node.tagName !== "li" || !firstChild) {
    return firstChild ?? node;
  }

  return getFirstChild(firstChild) ?? firstChild;
}

function createYamlRow(keyNode: Node, valueNode: Node, keyMeta: any, valueMeta: any): Element {
  const valueProperties: YamlProperties = {
    kind: "yamlValue",
    typeof: typeof valueMeta?.value,
    yaml: {},
  };

  if (isText(valueNode)) {
    valueProperties.yaml = {
      type: valueMeta?.type,
      comment: valueMeta?.comment,
      commentBefore: valueMeta?.commentBefore,
    };
  }

  return {
    type: HastTypeNames.element,
    tagName: "tr",
    children: [
      {
        type: HastTypeNames.element,
        tagName: "td",
        children: [keyNode],
        properties: {
          yaml: {
            comment: keyMeta?.comment,
            commentBefore: keyMeta?.commentBefore,
            spaceBefore: keyMeta?.spaceBefore,
          },
        },
      },
      {
        type: HastTypeNames.element,
        tagName: "td",
        children: [valueNode],
        properties: valueProperties,
      },
    ],
    properties: {},
  } as Element;
}

const astToString = (tree: Root): string => {
  const astToObject = (node: Node, properties: YamlProperties = {}): {} => {
    const { yaml: yamlProps, typeof: sourceType } = properties;

    if (isRoot(node)) {
      return astToObject(node.children[0]);
    }

    if (hasTagName(node, "table")) {
      const tbody = asYamlNode(node).children?.[0] as Element;
      const map = new YAMLMap();

      tbody.children.forEach((child) => {
        map.add(astToObject(child) as Pair);
      });

      return map;
    }

    if (isSequenceElement(node)) {
      const seq = new YAMLSeq();
      const yamlMeta = getYamlProperties(node);

      if (yamlMeta) {
        seq.flow = yamlMeta.flow;
        seq.spaceBefore = yamlMeta.spaceBefore;
      }

      node.children.forEach((child) => {
        const item = child as Element;
        const sourceNode = sequenceItemNode(item);
        seq.add(astToObject(sourceNode, getProperties(sourceNode)));
      });

      return seq;
    }

    if (isElement(node, "tr")) {
      const [keyCell, valueCell] = node.children as Element[];
      const keyText = getFirstChild(keyCell) as YamlAstNode;
      const valueNode = getFirstChild(valueCell) as Node;
      const pair = new YAMLPair({});

      pair.key = new Scalar(keyText.value);
      assignProperties(pair.key as Record<string, any>, getYamlProperties(keyCell));
      pair.value = astToObject(valueNode, getProperties(valueCell));

      return pair;
    }

    if (isText(node)) {
      const scalar = new Scalar(scalarValue(asYamlNode(node).value ?? "", sourceType));
      assignProperties(scalar as Record<string, any>, yamlProps);
      return scalar;
    }

    return {};
  };

  const doc = new YamlDoc(astToObject(tree));
  assignProperties(doc as Record<string, any>, asYamlNode(tree).data);

  return stringifyYaml(doc, { lineWidth: 0 });
};

const stringToAst = (source: string): Root => {
  const yamlDocument = parseYamlDoc(source);

  const objectToAst = (yamlNode: any): Node => {
    const content = yamlNode.contents || yamlNode;

    if (isMap(content)) {
      return {
        type: NodeTypeNames.yaml,
        tagName: "table",
        properties: {},
        children: [createElement("tbody", getMapRows(yamlNode, objectToAst))],
      } as Node;
    }

    if (isSeq(content)) {
      return createElement(
        "ul",
        { yaml: { flow: !!yamlNode?.flow, spaceBefore: yamlNode?.spaceBefore } },
        content.items.map((item: any) =>
          createElement(
            "li",
            { yaml: { spaceBefore: item.spaceBefore } },
            createElement(
              "p",
              {
                typeof: typeof item.value,
                yaml: {
                  type: item.type,
                  comment: item.comment,
                  commentBefore: item.commentBefore,
                  spaceBefore: item.spaceBefore,
                },
              },
              objectToAst(item),
            ),
          ),
        ),
      );
    }

    return text(yamlNode.source);
  };

  const tree = root([objectToAst(yamlDocument)]);
  asYamlNode(tree).data = {
    comment: yamlDocument.comment,
    commentBefore: yamlDocument.commentBefore,
  };

  return tree;
};

function getMapRows(
  yamlNode: any,
  objectToAst: (yamlNode: any) => Node,
): Element[] {
  const items: YAMLPair[] = yamlNode?.contents?.items || yamlNode?.items || [];

  return items
    .filter((pair: YAMLPair) => "key" in pair)
    .map((pair: YAMLPair) =>
      createYamlRow(
        objectToAst(pair.key),
        objectToAst(pair.value),
        pair.key,
        pair.value,
      ),
    );
}

const yaml: {
  astToString: (tree: Root) => string;
  stringToAst: (source: string) => Root;
} = {
  astToString,
  stringToAst,
};

export default yaml;
