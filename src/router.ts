/**
 * router.ts — the URL is the state.
 *
 * Everything except four link paths used to live in React state, so the browser's
 * back button either did nothing or threw you out of the app, and a refresh lost
 * your place. People reach for back without thinking; an app that ignores it
 * feels broken in a way that's hard to name.
 *
 * No routing library. There are about fifteen screens and the parsing fits in a
 * hundred lines, which is cheaper than a dependency and easier to read than a
 * config tree.
 */

export type Route =
  /* public */
  | { kind: "home" }
  | { kind: "signin" }
  | { kind: "signup" }
  | { kind: "demo" }
  | { kind: "about" }
  | { kind: "forgot" }
  | { kind: "reset"; token: string }
  | { kind: "invite"; token: string }
  /* resident and caretaker */
  | { kind: "scan"; slug: string }
  | { kind: "token"; token: string }
  | { kind: "ticket"; id: string }
  | { kind: "report" }
  | { kind: "sent" }
  /* operator */
  | { kind: "dashboard" }
  | { kind: "drill"; which: string }
  | { kind: "month"; bucket: string }
  | { kind: "repeat"; riser: string; object: string }
  | { kind: "buildings" }
  | { kind: "building"; code: string }
  | { kind: "codes"; code: string }
  | { kind: "stickers"; code?: string }
  | { kind: "staff" }
  | { kind: "orgs" }
  /* account */
  | { kind: "account" }
  | { kind: "password" };

/** Where a route lives. The inverse of `parse`, and the only place paths are written. */
export function href(r: Route): string {
  switch (r.kind) {
    case "home":      return "/";
    case "signin":    return "/signin";
    case "signup":    return "/signup";
    case "demo":      return "/demo";
    case "about":     return "/about";
    case "forgot":    return "/forgot";
    case "reset":     return `/reset/${r.token}`;
    case "invite":    return `/setup/${r.token}`;
    case "scan":      return `/r/${r.slug}`;
    case "token":     return `/t/${r.token}`;
    case "ticket":    return `/ticket/${r.id}`;
    case "report":    return "/report";
    case "sent":      return "/sent";
    case "dashboard": return "/dashboard";
    case "drill":     return `/dashboard/${r.which}`;
    case "month":     return `/dashboard/month/${r.bucket}`;
    case "repeat":    return `/dashboard/repeat/${encodeURIComponent(r.riser)}/${r.object}`;
    case "buildings": return "/buildings";
    case "building":  return `/buildings/${r.code}`;
    case "codes":     return `/buildings/${r.code}/codes`;
    case "stickers":  return r.code ? `/stickers/${r.code}` : "/stickers";
    case "staff":     return "/staff";
    case "orgs":      return "/orgs";
    case "account":   return "/account";
    case "password":  return "/account/password";
  }
}

const DRILLS = ["open", "parts", "trade", "failed"];

/** Anything unrecognised falls back to home rather than showing an error page. */
export function parse(pathname = location.pathname): Route {
  const p = pathname.replace(/\/+$/, "") || "/";
  const seg = p.split("/").filter(Boolean).map(decodeURIComponent);

  if (seg.length === 0) return { kind: "home" };

  switch (seg[0]) {
    case "signin":  return { kind: "signin" };
    case "signup":  return { kind: "signup" };
    case "demo":    return { kind: "demo" };
    case "about":   return { kind: "about" };
    case "forgot":  return { kind: "forgot" };
    case "sent":    return { kind: "sent" };
    case "report":  return { kind: "report" };
    case "staff":   return { kind: "staff" };
    case "orgs":    return { kind: "orgs" };

    case "reset":   return seg[1] ? { kind: "reset", token: seg[1] } : { kind: "home" };
    case "setup":   return seg[1] ? { kind: "invite", token: seg[1] } : { kind: "home" };
    case "r":       return seg[1] ? { kind: "scan", slug: seg[1] } : { kind: "home" };
    case "t":       return seg[1] ? { kind: "token", token: seg[1] } : { kind: "home" };
    case "ticket":  return seg[1] ? { kind: "ticket", id: seg[1] } : { kind: "home" };

    case "account":
      return seg[1] === "password" ? { kind: "password" } : { kind: "account" };

    case "stickers":
      return { kind: "stickers", code: seg[1] };

    case "buildings":
      if (!seg[1]) return { kind: "buildings" };
      if (seg[2] === "codes") return { kind: "codes", code: seg[1] };
      return { kind: "building", code: seg[1] };

    case "dashboard":
      if (!seg[1]) return { kind: "dashboard" };
      if (seg[1] === "month" && seg[2]) return { kind: "month", bucket: seg[2] };
      if (seg[1] === "repeat" && seg[2] && seg[3]) {
        return { kind: "repeat", riser: seg[2], object: seg[3] };
      }
      if (DRILLS.includes(seg[1])) return { kind: "drill", which: seg[1] };
      return { kind: "dashboard" };

    default:
      return { kind: "home" };
  }
}

/**
 * Filters live in the query string rather than the path.
 *
 * `/dashboard?months=3&building=B` is a shareable view of a filtered dashboard,
 * and it survives a refresh. They aren't part of the route's identity, which is
 * why they aren't in `Route`.
 */
export function readQuery() {
  const q = new URLSearchParams(location.search);
  const months = Number(q.get("months"));
  return {
    months: [1, 3, 6, 12].includes(months) ? months : 12,
    building: q.get("building") || null,
    rooms: q.get("rooms") || null,
  };
}

export function queryString(f: { months?: number; building?: string | null; rooms?: string | null }) {
  const q = new URLSearchParams();
  if (f.months && f.months !== 12) q.set("months", String(f.months));
  if (f.building) q.set("building", f.building);
  if (f.rooms) q.set("rooms", f.rooms);
  const s = q.toString();
  return s ? `?${s}` : "";
}
