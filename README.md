# @segmsh/yaml

YAML processor for the [segm.sh](https://segm.sh). Parses YAML files into a document (AST + segments) and stringifies them back, preserving structure while allowing content extraction.

## Installation

```bash
npm install @segmsh/yaml
```

## Usage

```typescript
import YamlProcessor from "@segmsh/yaml";

const processor = new YamlProcessor();

// Parse into a Document (AST + segments)
const doc = processor.parse(`
site:
  title: "Hello"
  links:
    - "Docs"
    - "API"
`);

// Modify doc.segments as needed ...

// Stringify back to YAML
const output = processor.stringify(doc);
```

## How it works

YAML scalars become segments, and their positions are tracked in a hast tree using dotted keys:

| YAML shape | Segment key |
|---|---|
| `site.title` | `site.title` |
| `links[0]` | `links..0` |
| `items[1].name` | `items..1.name` |

`..` distinguishes array indices from object keys. On parse, text nodes are replaced by segment refs in the tree, and on stringify those refs are resolved back from `doc.segments`.

## Development

```bash
npm run build
npm test
```

## License

[Apache-2.0](LICENSE)
