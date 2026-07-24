import { useEffect, useState } from 'react'
import CheckinExperience from './engine/checkin/CheckinExperience'
import LoadingScreen from './components/LoadingScreen'
import { preloadAll } from './lib/preload'

export default function App() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let mounted = true
    preloadAll().then(() => {
      if (mounted) setReady(true)
    })
    return () => {
      mounted = false
    }
  }, [])

  return ready ? <CheckinExperience /> : <LoadingScreen />
}
