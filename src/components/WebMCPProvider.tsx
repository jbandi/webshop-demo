import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { registerWebMCPTools } from '../lib/webmcp'

export default function WebMCPProvider() {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const unregister = registerWebMCPTools({
      onSearch: (term) => {
        window.dispatchEvent(
          new CustomEvent('chatbot-search', {
            detail: { term },
          }),
        )
      },
      onCartChange: async () => {
        await queryClient.invalidateQueries({ queryKey: ['cart'] })
      },
    })

    return unregister
  }, [queryClient])

  return null
}
