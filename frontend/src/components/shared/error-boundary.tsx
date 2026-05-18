import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface Props {
  children: ReactNode
  /** Mensaje personalizado para mostrar al usuario */
  fallbackMessage?: string
}

interface State {
  hasError: boolean
  error: Error | null
}

/**
 * Error Boundary para capturar errores de rendering.
 * React requiere que sea un componente de clase.
 * Envuelve secciones de la app para evitar que un crash en un componente
 * tire abajo toda la aplicación.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Error capturado:', error, errorInfo)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[400px] items-center justify-center p-8">
          <div className="mx-auto max-w-md text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-900/30">
              <AlertTriangle className="h-7 w-7 text-red-400" />
            </div>

            <h2 className="mb-2 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              Algo salio mal
            </h2>

            <p className="mb-1 text-sm text-zinc-600 dark:text-zinc-400">
              {this.props.fallbackMessage ??
                'Ocurrio un error inesperado. Podes intentar recargar esta seccion.'}
            </p>

            {this.state.error && (
              <p className="mb-6 font-mono text-xs text-zinc-700 dark:text-zinc-300">
                {this.state.error.message}
              </p>
            )}

            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={this.handleReset}
                className="inline-flex items-center gap-2 rounded-lg bg-gradient-cyan px-4 py-2 text-sm font-medium text-zinc-950 transition-colors hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
              >
                <RefreshCw className="h-4 w-4" />
                Reintentar
              </button>
              <button
                type="button"
                onClick={() => window.location.assign('/')}
                className="inline-flex items-center rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 transition-colors hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
              >
                Ir al inicio
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
