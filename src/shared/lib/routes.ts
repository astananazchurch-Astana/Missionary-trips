export type AppRoute = "/" | "/login" | "/admin" | "/apply";

export const appBasePath = import.meta.env.BASE_URL.endsWith("/")
  ? import.meta.env.BASE_URL
  : `${import.meta.env.BASE_URL}/`;

export function appPath(route: AppRoute) {
  const cleanRoute = route.replace(/^\//, "");

  return `${appBasePath}${cleanRoute}`;
}

export function getRouteFromLocation(location: Location = window.location): AppRoute {
  const basePath = appBasePath.endsWith("/") ? appBasePath.slice(0, -1) : appBasePath;
  let pathname = location.pathname;

  if (basePath && basePath !== "/" && pathname.startsWith(basePath)) {
    pathname = pathname.slice(basePath.length) || "/";
  }

  if (!pathname.startsWith("/")) {
    pathname = `/${pathname}`;
  }

  if (pathname === "/" || pathname === "/login" || pathname === "/admin" || pathname === "/apply") {
    return pathname;
  }

  return "/";
}
