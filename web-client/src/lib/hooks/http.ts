import { useFetch } from './useFetch'

export function useGet<T>(url: string, deps: React.DependencyList = []) {
  return useFetch<T>(
    (signal) =>
      fetch(url, { method: 'GET', signal }).then(async (res) => {
        if (!res.ok) throw new Error(`GET failed: ${res.status}`)
        return res.json()
      }),
    deps
  )
}

export function usePost<T, B = unknown>(
  url: string,
  body: B,
  deps: React.DependencyList = []
) {
  return useFetch<T>(
    (signal) =>
      fetch(url, {
        method: 'POST',
        signal,
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
      }).then(async (res) => {
        if (!res.ok) throw new Error(`POST failed: ${res.status}`)
        return res.json()
      }),
    deps
  )
}
