const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const currency = (business) => business.default_currency || "KES";
const pdfPageSizes = {
  A4: [595.28, 841.89],
  A5: [419.53, 595.28],
  Letter: [612, 792],
  Legal: [612, 1008]
};
const mmToPoints = (value) => Number(value || 0) * 2.8346456693;

const clampNumber = (value, min, max, fallback) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
};

const normalizePdfPrintSettings = (settings = {}) => {
  const pageSize = pdfPageSizes[settings.print_page_size] ? settings.print_page_size : "A4";
  const orientation = settings.print_orientation === "landscape" ? "landscape" : "portrait";
  const marginMm = clampNumber(settings.print_margin_mm, 5, 30, 14);
  const scale = clampNumber(settings.print_scale_percent, 75, 120, 100) / 100;
  const base = pdfPageSizes[pageSize];
  const [width, height] = orientation === "landscape" ? [base[1], base[0]] : base;
  return {
    width,
    height,
    margin: mmToPoints(marginMm),
    bottomMargin: mmToPoints(marginMm) + 4,
    scale
  };
};

const money = (value, business = {}) => `${currency(business)} ${Number(value || 0).toLocaleString()}`;
const dateOnly = (value) => {
  if (!value) return "-";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
};
const label = (value) => String(value || "-").replace(/_/g, " ");
const sanitizeFilename = (value) => String(value || "document.pdf").replace(/[^\w.-]+/g, "_");
const parseJson = (value) => {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
};

const pdfEscape = (value) =>
  String(value ?? "")
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");

const hexToRgb = (hex) => {
  const clean = String(hex || "#000000").replace("#", "");
  const value = clean.length === 3 ? clean.split("").map((char) => `${char}${char}`).join("") : clean.padEnd(6, "0").slice(0, 6);
  return [0, 2, 4].map((index) => parseInt(value.slice(index, index + 2), 16) / 255);
};

const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const inferMimeType = (logoUrl = "") => {
  const extension = path.extname(String(logoUrl).split("?")[0]).toLowerCase();
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  if (extension === ".gif") return "image/gif";
  return "";
};

const readLogoBuffer = (logoUrl) => {
  const value = String(logoUrl || "").trim();
  if (!value) return null;

  const dataMatch = value.match(/^data:([^;]+);base64,(.+)$/i);
  if (dataMatch) {
    return {
      mimeType: dataMatch[1].toLowerCase(),
      buffer: Buffer.from(dataMatch[2], "base64")
    };
  }

  if (/^https?:\/\//i.test(value)) return null;

  const relativePath = value.startsWith("/") ? value.slice(1) : value;
  const publicRoot = path.resolve(__dirname, "..", "..", "public");
  const filePath = path.resolve(publicRoot, relativePath);
  if (filePath !== publicRoot && !filePath.startsWith(`${publicRoot}${path.sep}`)) return null;
  if (!fs.existsSync(filePath)) return null;

  return {
    mimeType: inferMimeType(value),
    buffer: fs.readFileSync(filePath)
  };
};

const parseJpegImage = (buffer) => {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 4 < buffer.length) {
    if (buffer[offset] !== 0xff) break;
    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2 || offset + 2 + length > buffer.length) break;
    if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb)) {
      const components = buffer[offset + 9];
      const colorSpace = components === 1 ? "/DeviceGray" : components === 4 ? "/DeviceCMYK" : "/DeviceRGB";
      return {
        width: buffer.readUInt16BE(offset + 7),
        height: buffer.readUInt16BE(offset + 5),
        colorSpace,
        bitsPerComponent: 8,
        filter: "/DCTDecode",
        data: buffer
      };
    }
    offset += 2 + length;
  }
  return null;
};

const paeth = (left, up, upperLeft) => {
  const p = left + up - upperLeft;
  const pa = Math.abs(p - left);
  const pb = Math.abs(p - up);
  const pc = Math.abs(p - upperLeft);
  if (pa <= pb && pa <= pc) return left;
  return pb <= pc ? up : upperLeft;
};

const unfilterPngRows = ({ data, width, height, channels }) => {
  const rowLength = width * channels;
  const rows = [];
  let offset = 0;
  let previous = Buffer.alloc(rowLength);

  for (let y = 0; y < height; y += 1) {
    const filter = data[offset];
    if (filter > 4) throw new Error("Unsupported PNG row filter.");
    offset += 1;
    const source = data.subarray(offset, offset + rowLength);
    offset += rowLength;
    const row = Buffer.alloc(rowLength);

    for (let x = 0; x < rowLength; x += 1) {
      const left = x >= channels ? row[x - channels] : 0;
      const up = previous[x] || 0;
      const upperLeft = x >= channels ? previous[x - channels] || 0 : 0;
      let value = source[x];
      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += Math.floor((left + up) / 2);
      else if (filter === 4) value += paeth(left, up, upperLeft);
      row[x] = value & 0xff;
    }

    rows.push(row);
    previous = row;
  }

  return rows;
};

const encodePdfPngRows = (rows, width, channels) => {
  const rowLength = width * channels;
  const output = Buffer.alloc((rowLength + 1) * rows.length);
  rows.forEach((row, index) => {
    const offset = index * (rowLength + 1);
    output[offset] = 0;
    row.copy(output, offset + 1);
  });
  return zlib.deflateSync(output);
};

const splitAlphaRows = ({ rows, width, channels }) => {
  const colorChannels = channels - 1;
  const colorRows = [];
  const alphaRows = [];

  rows.forEach((row) => {
    const colors = Buffer.alloc(width * colorChannels);
    const alpha = Buffer.alloc(width);
    for (let pixel = 0; pixel < width; pixel += 1) {
      const sourceOffset = pixel * channels;
      const colorOffset = pixel * colorChannels;
      for (let channel = 0; channel < colorChannels; channel += 1) {
        colors[colorOffset + channel] = row[sourceOffset + channel];
      }
      alpha[pixel] = row[sourceOffset + channels - 1];
    }
    colorRows.push(colors);
    alphaRows.push(alpha);
  });

  return { colorRows, alphaRows };
};

const parsePngImage = (buffer) => {
  if (buffer.length < 33 || !buffer.subarray(0, 8).equals(pngSignature)) return null;

  let offset = 8;
  let ihdr = null;
  let palette = null;
  let transparency = null;
  const idatChunks = [];
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    if (offset + 12 + length > buffer.length) return null;
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      ihdr = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        compression: data[10],
        filter: data[11],
        interlace: data[12]
      };
    } else if (type === "IDAT") {
      idatChunks.push(data);
    } else if (type === "PLTE") {
      palette = data;
    } else if (type === "tRNS") {
      transparency = data;
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }

  if (!ihdr || ihdr.bitDepth !== 8 || ihdr.compression !== 0 || ihdr.filter !== 0 || ihdr.interlace !== 0 || !idatChunks.length) {
    return null;
  }

  const idat = Buffer.concat(idatChunks);
  if (ihdr.colorType === 2) {
    return {
      width: ihdr.width,
      height: ihdr.height,
      colorSpace: "/DeviceRGB",
      bitsPerComponent: 8,
      filter: "/FlateDecode",
      decodeParms: `<< /Predictor 15 /Colors 3 /BitsPerComponent 8 /Columns ${ihdr.width} >>`,
      data: idat
    };
  }
  if (ihdr.colorType === 0) {
    return {
      width: ihdr.width,
      height: ihdr.height,
      colorSpace: "/DeviceGray",
      bitsPerComponent: 8,
      filter: "/FlateDecode",
      decodeParms: `<< /Predictor 15 /Colors 1 /BitsPerComponent 8 /Columns ${ihdr.width} >>`,
      data: idat
    };
  }

  if (ihdr.colorType === 3) {
    if (!palette?.length || palette.length % 3 !== 0 || ihdr.bitDepth !== 8) return null;
    const hasAlpha = transparency && Array.from(transparency).some((alpha) => alpha < 255);
    if (!hasAlpha) {
      return {
        width: ihdr.width,
        height: ihdr.height,
        colorSpace: `[/Indexed /DeviceRGB ${palette.length / 3 - 1} <${palette.toString("hex")}>]`,
        bitsPerComponent: 8,
        filter: "/FlateDecode",
        decodeParms: `<< /Predictor 15 /Colors 1 /BitsPerComponent 8 /Columns ${ihdr.width} >>`,
        data: idat
      };
    }

    const indexRows = unfilterPngRows({
      data: zlib.inflateSync(idat),
      width: ihdr.width,
      height: ihdr.height,
      channels: 1
    });
    const colorRows = [];
    const alphaRows = [];
    indexRows.forEach((row) => {
      const colors = Buffer.alloc(ihdr.width * 3);
      const alpha = Buffer.alloc(ihdr.width);
      for (let pixel = 0; pixel < ihdr.width; pixel += 1) {
        const paletteIndex = row[pixel];
        const paletteOffset = paletteIndex * 3;
        colors[pixel * 3] = palette[paletteOffset] || 0;
        colors[pixel * 3 + 1] = palette[paletteOffset + 1] || 0;
        colors[pixel * 3 + 2] = palette[paletteOffset + 2] || 0;
        alpha[pixel] = transparency[paletteIndex] ?? 255;
      }
      colorRows.push(colors);
      alphaRows.push(alpha);
    });

    return {
      width: ihdr.width,
      height: ihdr.height,
      colorSpace: "/DeviceRGB",
      bitsPerComponent: 8,
      filter: "/FlateDecode",
      decodeParms: `<< /Predictor 15 /Colors 3 /BitsPerComponent 8 /Columns ${ihdr.width} >>`,
      data: encodePdfPngRows(colorRows, ihdr.width, 3),
      smask: {
        width: ihdr.width,
        height: ihdr.height,
        colorSpace: "/DeviceGray",
        bitsPerComponent: 8,
        filter: "/FlateDecode",
        decodeParms: `<< /Predictor 15 /Colors 1 /BitsPerComponent 8 /Columns ${ihdr.width} >>`,
        data: encodePdfPngRows(alphaRows, ihdr.width, 1)
      }
    };
  }

  if (ihdr.colorType !== 6 && ihdr.colorType !== 4) return null;

  const channels = ihdr.colorType === 6 ? 4 : 2;
  const rows = unfilterPngRows({
    data: zlib.inflateSync(idat),
    width: ihdr.width,
    height: ihdr.height,
    channels
  });
  const { colorRows, alphaRows } = splitAlphaRows({ rows, width: ihdr.width, channels });
  const colorChannels = channels - 1;

  return {
    width: ihdr.width,
    height: ihdr.height,
    colorSpace: colorChannels === 3 ? "/DeviceRGB" : "/DeviceGray",
    bitsPerComponent: 8,
    filter: "/FlateDecode",
    decodeParms: `<< /Predictor 15 /Colors ${colorChannels} /BitsPerComponent 8 /Columns ${ihdr.width} >>`,
    data: encodePdfPngRows(colorRows, ihdr.width, colorChannels),
    smask: {
      width: ihdr.width,
      height: ihdr.height,
      colorSpace: "/DeviceGray",
      bitsPerComponent: 8,
      filter: "/FlateDecode",
      decodeParms: `<< /Predictor 15 /Colors 1 /BitsPerComponent 8 /Columns ${ihdr.width} >>`,
      data: encodePdfPngRows(alphaRows, ihdr.width, 1)
    }
  };
};

const resolveLogoImage = (logoUrl) => {
  try {
    const logo = readLogoBuffer(logoUrl);
    if (!logo?.buffer?.length) return null;
    if (logo.mimeType === "image/jpeg" || logo.mimeType === "image/jpg") return parseJpegImage(logo.buffer);
    if (logo.mimeType === "image/png") return parsePngImage(logo.buffer);
    return null;
  } catch (error) {
    console.warn("Business logo could not be embedded in PDF attachment.", error.message);
    return null;
  }
};

class PdfDocument {
  constructor(settings = {}) {
    const print = normalizePdfPrintSettings(settings);
    this.width = print.width;
    this.height = print.height;
    this.margin = print.margin;
    this.bottomMargin = print.bottomMargin;
    this.scale = print.scale;
    this.contentWidth = this.width - this.margin * 2;
    this.pages = [];
    this.images = [];
    this.addPage();
  }

  addPage() {
    this.pages.push([]);
    this.y = this.margin;
  }

  current() {
    return this.pages[this.pages.length - 1];
  }

  push(command) {
    this.current().push(command);
  }

  pdfY(y, height = 0) {
    return this.height - y - height;
  }

  rgb(hex) {
    return hexToRgb(hex).map((part) => Number(part.toFixed(3))).join(" ");
  }

  rect(x, y, width, height, { fill = null, stroke = null, lineWidth = 0.6 } = {}) {
    const fillCommand = fill ? `${this.rgb(fill)} rg` : "";
    const strokeCommand = stroke ? `${this.rgb(stroke)} RG ${lineWidth} w` : "";
    const operator = fill && stroke ? "B" : fill ? "f" : "S";
    this.push(`q ${fillCommand} ${strokeCommand} ${x} ${this.pdfY(y, height)} ${width} ${height} re ${operator} Q`);
  }

  line(x1, y1, x2, y2, color = "#dde3ea", lineWidth = 0.6) {
    this.push(`q ${this.rgb(color)} RG ${lineWidth} w ${x1} ${this.pdfY(y1)} m ${x2} ${this.pdfY(y2)} l S Q`);
  }

  registerImage(image) {
    const name = `Im${this.images.length + 1}`;
    this.images.push({ ...image, name });
    return name;
  }

  image(image, x, y, width, height) {
    const name = this.registerImage(image);
    this.push(`q ${width} 0 0 ${height} ${x} ${this.pdfY(y, height)} cm /${name} Do Q`);
  }

  textWidth(value, size = 10, font = "F1") {
    const factor = font === "F2" ? 0.58 : 0.52;
    return String(value || "").length * size * factor;
  }

  wrapText(value, maxWidth, size = 10, font = "F1") {
    const words = String(value ?? "-").split(/\s+/).filter(Boolean);
    const lines = [];
    let line = "";

    words.forEach((word) => {
      const candidate = line ? `${line} ${word}` : word;
      if (this.textWidth(candidate, size, font) <= maxWidth || !line) {
        line = candidate;
      } else {
        lines.push(line);
        line = word;
      }
    });

    if (line) lines.push(line);
    return lines.length ? lines : ["-"];
  }

  text(value, x, y, { size = 10, font = "F1", color = "#172033", maxWidth = null, lineHeight = null, align = "left" } = {}) {
    const lines = maxWidth ? this.wrapText(value, maxWidth, size, font) : [String(value ?? "")];
    const step = lineHeight || Math.ceil(size * 1.32);
    lines.forEach((line, index) => {
      const textWidth = this.textWidth(line, size, font);
      const textX = align === "right" && maxWidth ? x + maxWidth - textWidth : x;
      this.push(`BT /${font} ${size} Tf ${this.rgb(color)} rg 1 0 0 1 ${textX} ${this.pdfY(y + index * step + size)} Tm (${pdfEscape(line)}) Tj ET`);
    });
    return lines.length * step;
  }

  ensureSpace(height) {
    if (this.y + height > this.height - this.bottomMargin) {
      this.addPage();
    }
  }

  move(height) {
    this.y += height;
  }

  brandHeader(business) {
    const x = this.margin;
    const name = business.business_name || "Water Billing";
    const initials = name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "AG";

    const logo = resolveLogoImage(business.logo_url);
    if (logo) {
      const boxWidth = 74;
      const boxHeight = 58;
      const scale = Math.min(boxWidth / logo.width, boxHeight / logo.height);
      const imageWidth = Math.max(1, logo.width * scale);
      const imageHeight = Math.max(1, logo.height * scale);
      this.rect(x, this.y, boxWidth, boxHeight, { fill: "#ffffff", stroke: "#dde3ea" });
      this.image(logo, x + (boxWidth - imageWidth) / 2, this.y + (boxHeight - imageHeight) / 2, imageWidth, imageHeight);
    } else {
      this.rect(x, this.y, 74, 58, { fill: "#0f766e", stroke: "#0f766e" });
      this.text(initials, x + 21, this.y + 19, { size: 18, font: "F2", color: "#ffffff" });
    }
    this.text(name, x + 88, this.y + 2, { size: 17, font: "F2", color: "#172033", maxWidth: this.contentWidth - 88 });
    let infoY = this.y + 24;
    [business.legal_name, business.physical_address, [business.phone, business.email].filter(Boolean).join(" | "), business.tax_pin ? `PIN: ${business.tax_pin}` : null]
      .filter(Boolean)
      .forEach((line) => {
        this.text(line, x + 88, infoY, { size: 9, color: "#344256", maxWidth: this.contentWidth - 88 });
        infoY += 12;
      });
    this.move(72);
    this.line(this.margin, this.y - 2, this.margin + this.contentWidth, this.y - 2, "#172033", 1.4);
    this.move(14);
  }

  titleBoxes(left, right) {
    const gap = 10;
    const width = (this.contentWidth - gap) / 2;
    const draw = (item, x) => {
      this.rect(x, this.y, width, 48, { fill: "#ffffff", stroke: "#dde3ea" });
      this.text(item.label, x + 10, this.y + 9, { size: 7.5, font: "F2", color: "#637083", maxWidth: width - 20 });
      this.text(item.value, x + 10, this.y + 24, { size: 12, font: "F2", color: "#172033", maxWidth: width - 20 });
    };
    draw(left, this.margin);
    draw(right, this.margin + width + gap);
    this.move(62);
  }

  infoGrid(items) {
    const gap = 10;
    const columns = 2;
    const width = (this.contentWidth - gap) / columns;
    const rowHeight = 54;

    for (let index = 0; index < items.length; index += columns) {
      this.ensureSpace(rowHeight + 8);
      items.slice(index, index + columns).forEach((item, columnIndex) => {
        const x = this.margin + columnIndex * (width + gap);
        this.rect(x, this.y, width, rowHeight, { fill: "#ffffff", stroke: "#dde3ea" });
        this.text(item.label, x + 10, this.y + 9, { size: 7.5, font: "F2", color: "#637083", maxWidth: width - 20 });
        this.text(item.value, x + 10, this.y + 24, { size: 11, font: "F2", color: "#172033", maxWidth: width - 20 });
        if (item.subtext) {
          this.text(item.subtext, x + 10, this.y + 39, { size: 8, color: "#637083", maxWidth: width - 20 });
        }
      });
      this.move(rowHeight + 8);
    }
    this.move(3);
  }

  sectionTitle(title) {
    this.ensureSpace(28);
    this.text(title, this.margin, this.y, { size: 11, font: "F2", color: "#172033" });
    this.move(19);
  }

  table(columns, rows) {
    const totalWeight = columns.reduce((sum, column) => sum + (column.weight || 1), 0);
    const widths = columns.map((column) => Math.floor((this.contentWidth * (column.weight || 1)) / totalWeight));
    widths[widths.length - 1] += this.contentWidth - widths.reduce((sum, width) => sum + width, 0);
    const padding = 7;
    const headerHeight = 26;

    this.ensureSpace(headerHeight + 20);
    this.rect(this.margin, this.y, this.contentWidth, headerHeight, { fill: "#172033", stroke: "#172033" });
    let x = this.margin;
    columns.forEach((column, index) => {
      this.text(column.header, x + padding, this.y + 8, { size: 8, font: "F2", color: "#ffffff", maxWidth: widths[index] - padding * 2 });
      x += widths[index];
    });
    this.move(headerHeight);

    rows.forEach((row, rowIndex) => {
      const cellLines = columns.map((column, index) =>
        this.wrapText(typeof column.value === "function" ? column.value(row) : row[column.value], widths[index] - padding * 2, 8.5)
      );
      const rowHeight = Math.max(28, Math.max(...cellLines.map((lines) => lines.length)) * 12 + padding * 2);
      this.ensureSpace(rowHeight + 8);
      this.rect(this.margin, this.y, this.contentWidth, rowHeight, {
        fill: rowIndex % 2 === 0 ? "#ffffff" : "#f8fafc",
        stroke: "#dde3ea"
      });
      x = this.margin;
      columns.forEach((column, index) => {
        const value = cellLines[index].join(" ");
        this.text(value, x + padding, this.y + padding, {
          size: 8.5,
          color: "#172033",
          maxWidth: widths[index] - padding * 2,
          align: column.align || "left"
        });
        x += widths[index];
      });
      this.move(rowHeight);
    });
    this.move(14);
  }

  totals(rows) {
    rows.forEach((row) => {
      this.ensureSpace(40);
      const primary = row.primary;
      this.rect(this.margin, this.y, this.contentWidth, 34, { fill: primary ? "#e7f5f3" : "#ffffff", stroke: "#dde3ea" });
      this.text(row.label, this.margin + 10, this.y + 10, { size: 8, font: "F2", color: "#637083", maxWidth: this.contentWidth * 0.56 });
      this.text(row.value, this.margin + this.contentWidth * 0.58, this.y + 9, {
        size: primary ? 13 : 11,
        font: "F2",
        color: primary ? "#0f766e" : "#172033",
        maxWidth: this.contentWidth * 0.4,
        align: "right"
      });
      this.move(40);
    });
  }

  footer(lines) {
    const cleanLines = lines.filter(Boolean);
    if (!cleanLines.length) return;
    this.ensureSpace(cleanLines.length * 13 + 18);
    this.line(this.margin, this.y, this.margin + this.contentWidth, this.y, "#dde3ea");
    this.move(10);
    cleanLines.forEach((line) => {
      this.text(line, this.margin, this.y, { size: 8.5, color: "#344256", maxWidth: this.contentWidth });
      this.move(12);
    });
  }

  render() {
    const objects = [];
    const addObject = (body) => {
      objects.push(body);
      return objects.length;
    };
    const toBuffer = (value) => (Buffer.isBuffer(value) ? value : Buffer.from(String(value), "utf8"));
    const fontRegularId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
    const fontBoldId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
    const imageObjectIds = new Map();

    const addImageObject = (image) => {
      let smaskId = null;
      if (image.smask) {
        smaskId = addImageObject(image.smask);
      }
      const dict = [
        "<< /Type /XObject",
        "/Subtype /Image",
        `/Width ${Math.round(image.width)}`,
        `/Height ${Math.round(image.height)}`,
        `/ColorSpace ${image.colorSpace}`,
        `/BitsPerComponent ${image.bitsPerComponent}`,
        `/Filter ${image.filter}`,
        image.decodeParms ? `/DecodeParms ${image.decodeParms}` : "",
        smaskId ? `/SMask ${smaskId} 0 R` : "",
        `/Length ${image.data.length}`,
        ">>\nstream\n"
      ]
        .filter(Boolean)
        .join(" ");
      return addObject(Buffer.concat([Buffer.from(dict, "utf8"), image.data, Buffer.from("\nendstream", "utf8")]));
    };

    this.images.forEach((image) => {
      imageObjectIds.set(image.name, addImageObject(image));
    });

    const xobjectResource = this.images.length
      ? ` /XObject << ${this.images.map((image) => `/${image.name} ${imageObjectIds.get(image.name)} 0 R`).join(" ")} >>`
      : "";
    const pageIds = [];

    this.pages.forEach((commands) => {
      const content = commands.join("\n");
      const contentId = addObject(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`);
      const pageId = addObject(
        `<< /Type /Page /Parent 0 0 R /MediaBox [0 0 ${Number(this.width.toFixed(2))} ${Number(this.height.toFixed(2))}] /Resources << /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R >>${xobjectResource} >> /Contents ${contentId} 0 R >>`
      );
      pageIds.push(pageId);
    });

    const pagesId = addObject(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`);
    pageIds.forEach((pageId) => {
      objects[pageId - 1] = objects[pageId - 1].replace("/Parent 0 0 R", `/Parent ${pagesId} 0 R`);
    });
    const catalogId = addObject(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
    const chunks = [Buffer.from("%PDF-1.4\n", "utf8")];
    const offsets = [0];
    objects.forEach((body, index) => {
      offsets.push(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
      chunks.push(Buffer.from(`${index + 1} 0 obj\n`, "utf8"), toBuffer(body), Buffer.from("\nendobj\n", "utf8"));
    });
    const xrefOffset = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    chunks.push(Buffer.from(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`, "utf8"));
    offsets.slice(1).forEach((offset) => chunks.push(Buffer.from(`${String(offset).padStart(10, "0")} 00000 n \n`, "utf8")));
    chunks.push(Buffer.from(`trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`, "utf8"));
    return Buffer.concat(chunks);
  }
}

const nonZeroChargeRows = (bill, business) =>
  [
    ["Usage subtotal", bill.subtotal_amount || bill.amount],
    ["Fixed charge", bill.fixed_charge_amount],
    ["Penalty", bill.penalty_amount],
    ["VAT", bill.vat_amount],
    ["Reconnection fee", bill.reconnection_fee_amount],
    ["Adjustment", bill.adjustment_amount]
  ]
    .filter(([name, amount]) => name === "Usage subtotal" || Number(amount || 0) !== 0)
    .map(([name, amount]) => ({ name, amount: money(amount, business) }));

const buildBillPdfAttachment = ({ bill, business = {} }) => {
  const total = Number(bill.total_amount || bill.amount || 0);
  const balance = Number(bill.balance_amount ?? total - Number(bill.paid_amount || 0));
  const tariff = parseJson(bill.tariff_snapshot);
  const tariffBlocks = Array.isArray(tariff.blocks) ? tariff.blocks : [];
  const penalties = Array.isArray(bill.penalty_applications) ? bill.penalty_applications : [];
  const document = new PdfDocument(business);

  document.brandHeader(business);
  document.titleBoxes(
    { label: "Bill", value: bill.bill_number || `Bill ${bill.id}` },
    { label: "Due Date", value: dateOnly(bill.due_date) }
  );
  document.infoGrid([
    { label: "Customer", value: bill.customer_name || "-", subtext: bill.acc_number || "" },
    { label: "Phone", value: bill.phone || "-" },
    { label: "Billing Period", value: bill.billing_period_name || dateOnly(bill.billing_month) },
    { label: "Status", value: label(bill.status) }
  ]);

  document.sectionTitle("Reading Summary");
  document.table(
    [
      { header: "Previous", value: (row) => row.previous },
      { header: "Current", value: (row) => row.current },
      { header: "Units", value: (row) => row.units },
      { header: "Rate", value: (row) => row.rate },
      { header: "Subtotal", value: (row) => row.subtotal, align: "right", weight: 1.25 }
    ],
    [
      {
        previous: Number(bill.previous_reading || 0).toLocaleString(),
        current: Number(bill.current_reading || 0).toLocaleString(),
        units: Number(bill.units_used || 0).toLocaleString(),
        rate: money(bill.rate, business),
        subtotal: money(bill.subtotal_amount || bill.amount, business)
      }
    ]
  );

  document.sectionTitle("Charge Breakdown");
  document.table(
    [
      { header: "Charge", value: "name", weight: 1.4 },
      { header: "Amount", value: "amount", align: "right" }
    ],
    nonZeroChargeRows(bill, business)
  );

  document.sectionTitle("Calculation Basis");
  document.table(
    [
      { header: "Basis", value: "basis", weight: 1 },
      { header: "Value", value: "value", weight: 2 }
    ],
    [
      {
        basis: "Tariff",
        value: [tariff.name || "-", tariff.effective_from ? `effective ${dateOnly(tariff.effective_from)}` : null, tariff.version_id ? `version ${tariff.version_id}` : null]
          .filter(Boolean)
          .join(" | ")
      },
      { basis: "Tariff type", value: label(tariff.tariff_type || "flat") },
      {
        basis: "Usage formula",
        value: `${Number(bill.units_used || 0).toLocaleString()} units x ${money(bill.rate, business)}; subtotal ${money(
          bill.subtotal_amount || bill.amount,
          business
        )}`
      },
      ...(tariffBlocks.length
        ? [
            {
              basis: "Block rows",
              value: tariffBlocks
                .map((block) => {
                  const from = Number(block.min_units || 0).toLocaleString();
                  const to = block.max_units === null || block.max_units === undefined ? "above" : Number(block.max_units).toLocaleString();
                  return `${from}-${to}: ${money(block.unit_rate, business)}`;
                })
                .join(" | ")
            }
          ]
        : []),
      {
        basis: "Principal basis",
        value: `${money(bill.subtotal_amount || bill.amount, business)} usage + ${money(bill.fixed_charge_amount, business)} fixed; penalty and VAT shown separately.`
      }
    ]
  );

  if (penalties.length) {
    document.sectionTitle("Penalty History");
    document.table(
      [
        { header: "Penalty Month", value: (row) => dateOnly(row.application_month) },
        { header: "Principal", value: (row) => money(row.principal_amount, business), align: "right" },
        { header: "Penalty", value: (row) => money(row.penalty_amount, business), align: "right" },
        { header: "Status", value: "status" },
        { header: "Waiver", value: (row) => row.waiver_reason || row.waived_by_name || (row.waived_at ? dateOnly(row.waived_at) : "-") }
      ],
      penalties
    );
  }

  document.totals([
    { label: "Total billed", value: money(total, business), primary: true },
    { label: "Paid / credit applied", value: money(bill.paid_amount, business) },
    { label: "Amount due", value: money(balance, business) }
  ]);
  document.footer([
    business.paybill_number ? `Paybill: ${business.paybill_number}` : null,
    business.till_number ? `Till: ${business.till_number}` : null,
    business.bank_details ? `Bank details: ${business.bank_details}` : null,
    business.receipt_footer_note || "Thank you.",
    `${business.business_name || "Water Billing"} customer bill`
  ]);

  return {
    filename: sanitizeFilename(`${bill.bill_number || `bill-${bill.id}`}.pdf`),
    content: document.render(),
    contentType: "application/pdf"
  };
};

const buildReceiptPdfAttachment = ({ payment, allocations = [], customerBalance = 0, business = {} }) => {
  const document = new PdfDocument(business);
  const positionIsCredit = Number(customerBalance || 0) < 0;

  document.brandHeader(business);
  document.titleBoxes(
    { label: "Receipt", value: payment.receipt_number || `RCPT-${payment.id}` },
    { label: "Date", value: dateOnly(payment.payment_date) }
  );
  document.infoGrid([
    { label: "Received From", value: payment.received_from || payment.customer_name || "-" },
    { label: "Customer", value: payment.customer_name || "-", subtext: payment.acc_number || "" },
    { label: "Channel", value: label(payment.payment_channel || payment.method) },
    { label: "Reference", value: payment.external_reference || payment.reference || "-" }
  ]);

  document.sectionTitle("Receipt Allocations");
  document.table(
    [
      { header: "Bill", value: (row) => row.bill_number || (row.bill_id ? `Bill ${row.bill_id}` : row.message), weight: 1.25 },
      { header: "Billing Month", value: (row) => (row.billing_month ? dateOnly(row.billing_month) : "-") },
      { header: "Bill Total", value: (row) => (row.bill_total === undefined ? "-" : money(row.bill_total, business)), align: "right" },
      { header: "Allocated", value: (row) => (row.amount === undefined ? "-" : money(row.amount, business)), align: "right" },
      { header: "Bill Balance", value: (row) => (row.balance_amount === undefined ? "-" : money(row.balance_amount, business)), align: "right" }
    ],
    allocations.length ? allocations : [{ message: "No open bills. Full amount stored as customer credit." }]
  );

  document.totals([
    { label: "Total received", value: money(payment.amount, business), primary: true },
    { label: "Allocated to bills", value: money(payment.total_allocated_amount, business) },
    { label: "Customer credit", value: money(payment.unallocated_amount, business) },
    {
      label: `${positionIsCredit ? "Customer credit" : "Amount due"} after receipt`,
      value: `${money(Math.abs(Number(customerBalance || 0)), business)}${positionIsCredit ? " credit" : ""}`
    }
  ]);
  document.footer([
    business.paybill_number ? `Paybill: ${business.paybill_number}` : null,
    business.till_number ? `Till: ${business.till_number}` : null,
    business.bank_details ? `Bank details: ${business.bank_details}` : null,
    business.receipt_footer_note || "Thank you.",
    payment.recorded_by_name ? `Recorded by ${payment.recorded_by_name}` : null
  ]);

  return {
    filename: sanitizeFilename(`${payment.receipt_number || `receipt-${payment.id}`}.pdf`),
    content: document.render(),
    contentType: "application/pdf"
  };
};

const buildPayslipPdfAttachment = ({ payrollLine, business = {} }) => {
  const document = new PdfDocument(business);
  const payslipNumber = `PAYSLIP-${payrollLine.payroll_run_id}-${payrollLine.id}`;
  const grossPay = Number(payrollLine.gross_amount || 0) + Number(payrollLine.additions || 0);

  document.brandHeader(business);
  document.titleBoxes(
    { label: "Payslip", value: payslipNumber },
    { label: "Period", value: `${dateOnly(payrollLine.period_start)} to ${dateOnly(payrollLine.period_end)}` }
  );
  document.infoGrid([
    { label: "Payee", value: payrollLine.name || "-", subtext: payrollLine.code || "" },
    { label: "Role / Title", value: payrollLine.title || label(payrollLine.payee_type) },
    { label: "Pay Run", value: payrollLine.run_name || `Run ${payrollLine.payroll_run_id}` },
    { label: "Status", value: label(payrollLine.status) },
    { label: "Payment Channel", value: label(payrollLine.payment_channel) },
    { label: "Payment Date", value: payrollLine.paid_at ? dateOnly(payrollLine.paid_at) : "-" }
  ]);

  document.sectionTitle("Earnings And Deductions");
  document.table(
    [
      { header: "Item", value: "item", weight: 1.5 },
      { header: "Basis", value: "basis" },
      { header: "Amount", value: "amount", align: "right" }
    ],
    [
      {
        item: "Basic pay",
        basis: `${Number(payrollLine.source_units || 0).toLocaleString()} ${label(payrollLine.rate_basis)}`,
        amount: money(payrollLine.gross_amount, business)
      },
      {
        item: "Additions",
        basis: payrollLine.notes || "-",
        amount: money(payrollLine.additions, business)
      },
      {
        item: "Deductions",
        basis: "-",
        amount: `-${money(payrollLine.deductions, business)}`
      }
    ]
  );

  document.totals([
    { label: "Gross earnings", value: money(grossPay, business) },
    { label: "Total deductions", value: money(payrollLine.deductions, business) },
    { label: "Net pay", value: money(payrollLine.net_amount, business), primary: true }
  ]);

  document.sectionTitle("Payment Record");
  document.table(
    [
      { header: "Field", value: "field" },
      { header: "Value", value: "value", weight: 2 }
    ],
    [
      { field: "Run status", value: label(payrollLine.run_status) },
      { field: "Line status", value: label(payrollLine.status) },
      { field: "Expense reference", value: payrollLine.expense_reference || (payrollLine.expense_id ? `Expense #${payrollLine.expense_id}` : "-") },
      { field: "Paid by", value: payrollLine.paid_by_name || "-" }
    ]
  );

  document.footer([
    business.report_footer_note || business.receipt_footer_note || "This payslip was generated from the payroll register.",
    `${business.business_name || "Water Billing"} payroll document`
  ]);

  return {
    filename: sanitizeFilename(`${payslipNumber}-${payrollLine.name || payrollLine.payee_id}.pdf`),
    content: document.render(),
    contentType: "application/pdf"
  };
};

module.exports = {
  buildBillPdfAttachment,
  buildPayslipPdfAttachment,
  buildReceiptPdfAttachment
};
