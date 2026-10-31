import { useEffect } from 'react'
import ControlConsole from './ControlConsole'
import Portal from './Portal'

function App() {
  const isControl = window.location.pathname === '/control'

  useEffect(() => {
    document.title = isControl ? 'Dimensional Control — Operator Console' : 'Dimensional Control — Portal'
  }, [isControl])

  return isControl ? <ControlConsole /> : <Portal />
}

export default App
