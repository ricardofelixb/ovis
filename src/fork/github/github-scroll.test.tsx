import { afterEach, beforeEach, expect, test } from "bun:test";
import { openPage, type Page } from "../../lib/page.fixture.ts";
import { useKeptScroll } from "./github.ts";

let page: Page;
let previous: PropertyDescriptor | undefined;
beforeEach(() => {
  page = openPage();
  previous = Object.getOwnPropertyDescriptor(globalThis, "cancelAnimationFrame");
  Object.defineProperty(globalThis, "cancelAnimationFrame", { configurable: true, value: () => {} });
});
afterEach(async () => {
  await page.close();
  if (previous) Object.defineProperty(globalThis, "cancelAnimationFrame", previous); else Reflect.deleteProperty(globalThis, "cancelAnimationFrame");
});
function Scroller({ name, visible }: { name: string; visible: boolean }) {
  const ref = useKeptScroll<HTMLDivElement>(name, visible);
  return visible ? <div className="host" ref={ref} /> : null;
}
const scrollTo = (host: HTMLElement, top: number) => { host.scrollTop = top; host.dispatchEvent(new page.window.Event("scroll") as unknown as Event); };

test("restores and records scrolling after the phone list returns", async () => {
  await page.render(<Scroller name="test-phone" visible />);
  scrollTo(page.one(".host"), 250);
  await page.render(<Scroller name="test-phone" visible={false} />);
  await page.render(<Scroller name="test-phone" visible />);
  expect(page.one(".host").scrollTop).toBe(250);
  scrollTo(page.one(".host"), 320);
  await page.render(<Scroller name="test-phone" visible={false} />);
  await page.render(<Scroller name="test-phone" visible />);
  expect(page.one(".host").scrollTop).toBe(320);
});

test("a first-visited tab starts at the top of the shared element", async () => {
  await page.render(<Scroller name="test-tab-one" visible />);
  const host = page.one(".host");
  scrollTo(host, 250);
  await page.render(<Scroller name="test-tab-two" visible />);
  expect(page.one(".host")).toBe(host);
  expect(host.scrollTop).toBe(0);
});
