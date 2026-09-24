export function fxlaySdk04Violate() {
  void fetch('/x');
  const xhr = new XMLHttpRequest();
  const es = new EventSource('/events');
  return { xhr, es };
}
