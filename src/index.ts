import type { Element, Node, Root } from "hast";
import {
  Document,
  Processor,
  Segment,
  SegmentRef,
  id,
  segment,
  text,
  visitParents,
} from "@segmsh/core";
import yaml, { HastTypeNames } from "./utils.js";

type YamlNode = Node & {
  children?: Node[];
  properties?: Record<string, any>;
  tagName?: string;
  value?: string;
};

function asYamlNode(node: Node): YamlNode {
  return node as YamlNode;
}

function isElement(node: Node, tagName?: string): node is Element {
  return node.type === "element" && (!tagName || asYamlNode(node).tagName === tagName);
}

function getFirstChild(node: Node): YamlNode | undefined {
  return asYamlNode(node).children?.[0] as YamlNode | undefined;
}

function isYamlValueNode(node: Node): boolean {
  return asYamlNode(node).properties?.kind === "yamlValue";
}

function isSegmentContainer(node: Node): boolean {
  return isYamlValueNode(node) || isElement(node, "p");
}

function getListIndex(parents: Node[], item: Element): number | undefined {
  const list = parents.findLast(
    (ancestor): ancestor is Element =>
      isElement(ancestor) &&
      (ancestor.tagName === "ul" || ancestor.tagName === "ol") &&
      ancestor.children.includes(item),
  );

  if (!list) return undefined;

  return list.children
    .filter((child): child is Element => isElement(child, "li"))
    .indexOf(item);
}

function getKeyPath(parents: Node[]): string {
  const parts: string[] = [];

  for (const parent of parents) {
    if (isElement(parent, "tr")) {
      const keyCell = getFirstChild(parent);
      const keyNode = keyCell ? getFirstChild(keyCell) : undefined;

      if (keyNode?.type === HastTypeNames.text) {
        parts.push(keyNode.value ?? "");
      }

      continue;
    }

    if (isElement(parent, "li")) {
      const index = getListIndex(parents, parent);

      if (index !== undefined) {
        parts.push("", String(index));
      }
    }
  }

  return parts.join(".");
}

function treeToDocument(tree: Root): Document {
  const segments: Segment[] = [];

  visitParents(tree, isSegmentContainer, (node: Node, parents: Node[]) => {
    if (!isElement(node)) return;

    const child = getFirstChild(node);
    if (!child || child.type !== HastTypeNames.text) return;

    const key = getKeyPath(parents);
    const segId = id(key);

    segments.push({
      id: segId,
      text: child.value ?? "",
      ...(key && { metadata: { key } }),
    });

    node.children = [segment(segId)];
  });

  return { tree, segments };
}

function documentToTree(doc: Document): Root {
  const segments = Object.fromEntries(doc.segments.map((entry) => [entry.id, entry]));

  visitParents(doc.tree, { type: "segment" }, (node: Node, parents: Node[]) => {
    const segmentNode = node as SegmentRef;
    const currentParent = parents[parents.length - 1];
    const currentSegment = segments[segmentNode.id];

    if (!currentSegment || !currentParent || !isElement(currentParent)) return;

    currentParent.children = [text(currentSegment.text)];
  });

  return doc.tree;
}

export default class YamlProcessor implements Processor {
  parse(res: string): Document {
    return treeToDocument(yaml.stringToAst(res));
  }

  stringify(doc: Document): string {
    return yaml.astToString(documentToTree(doc));
  }
}
