const startsWith = (buffer, bytes) =>
  bytes.every((byte, index) => buffer[index] === byte);

const isZip = (buffer) =>
  startsWith(buffer, [0x50, 0x4b, 0x03, 0x04]) ||
  startsWith(buffer, [0x50, 0x4b, 0x05, 0x06]) ||
  startsWith(buffer, [0x50, 0x4b, 0x07, 0x08]);

const matchesFileSignature = (buffer, mimeType) => {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return false;

  switch (mimeType) {
    case "application/pdf":
      return startsWith(buffer, [0x25, 0x50, 0x44, 0x46, 0x2d]);
    case "image/jpeg":
      return startsWith(buffer, [0xff, 0xd8, 0xff]);
    case "image/png":
      return startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "image/webp":
      return buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP";
    case "image/gif":
      return buffer.toString("ascii", 0, 6) === "GIF87a" || buffer.toString("ascii", 0, 6) === "GIF89a";
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      return isZip(buffer);
    default:
      return false;
  }
};

module.exports = {
  matchesFileSignature
};

