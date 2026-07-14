// Pure IP-range checks used to block SSRF targets (PLAN §10.2): private,
// link-local, loopback, and metadata ranges. No I/O — see safe-fetch.ts for
// the DNS-resolving fetcher that uses this.

const IPV4_BLOCKED_RANGES: Array<[string, number]> = [
  ["0.0.0.0", 8], // "this network"
  ["10.0.0.0", 8], // RFC1918 private
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local, incl. 169.254.169.254 (cloud metadata)
  ["172.16.0.0", 12], // RFC1918 private
  ["192.168.0.0", 16], // RFC1918 private
  ["198.18.0.0", 15], // benchmarking
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved
];

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let result = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    result = (result << 8) | n;
  }
  return result >>> 0;
}

function isIPv4Blocked(ip: string): boolean {
  const addr = ipv4ToInt(ip);
  if (addr === null) return true; // unparsable — fail closed
  for (const [base, prefix] of IPV4_BLOCKED_RANGES) {
    const baseAddr = ipv4ToInt(base) as number;
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    if ((addr & mask) === (baseAddr & mask)) return true;
  }
  return false;
}

// Expands an IPv6 literal (with optional "::" compression and optional
// trailing IPv4-mapped dotted quad) into 8 16-bit groups.
function parseIPv6Groups(ipInput: string): number[] | null {
  const zoneIdx = ipInput.indexOf("%");
  const ip = zoneIdx === -1 ? ipInput : ipInput.slice(0, zoneIdx);

  const halves = ip.split("::");
  if (halves.length > 2) return null;

  const parseHextets = (s: string): number[] | null => {
    if (s === "") return [];
    const segs = s.split(":");
    const out: number[] = [];
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i];
      if (seg.includes(".")) {
        if (i !== segs.length - 1) return null;
        const v4 = ipv4ToInt(seg);
        if (v4 === null) return null;
        out.push((v4 >>> 16) & 0xffff, v4 & 0xffff);
        continue;
      }
      if (!/^[0-9a-fA-F]{1,4}$/.test(seg)) return null;
      out.push(Number.parseInt(seg, 16));
    }
    return out;
  };

  if (halves.length === 1) {
    const groups = parseHextets(halves[0]);
    if (!groups || groups.length !== 8) return null;
    return groups;
  }

  const head = parseHextets(halves[0]);
  const tail = parseHextets(halves[1]);
  if (!head || !tail) return null;
  const missing = 8 - head.length - tail.length;
  if (missing < 0) return null;
  return [...head, ...new Array(missing).fill(0), ...tail];
}

function isIPv6Blocked(ip: string): boolean {
  const groups = parseIPv6Groups(ip);
  if (!groups) return true; // unparsable — fail closed

  // IPv4-mapped ::ffff:a.b.c.d — defer to the IPv4 range table.
  if (
    groups[0] === 0 &&
    groups[1] === 0 &&
    groups[2] === 0 &&
    groups[3] === 0 &&
    groups[4] === 0 &&
    groups[5] === 0xffff
  ) {
    const v4 = `${(groups[6] >> 8) & 0xff}.${groups[6] & 0xff}.${(groups[7] >> 8) & 0xff}.${groups[7] & 0xff}`;
    return isIPv4Blocked(v4);
  }

  if (groups.every((g) => g === 0)) return true; // ::  (unspecified)
  if (groups.slice(0, 7).every((g) => g === 0) && groups[7] === 1) return true; // ::1 (loopback)
  if ((groups[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((groups[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local

  return false;
}

export function isBlockedAddress(ip: string): boolean {
  return ip.includes(":") ? isIPv6Blocked(ip) : isIPv4Blocked(ip);
}
