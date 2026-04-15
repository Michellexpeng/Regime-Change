import { Component, ReactNode } from 'react'

interface Props {
  children: ReactNode
  label?: string
}

interface State {
  hasError: boolean
  message: string
}

export class ChartErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-full text-red-400 text-xs p-4 border border-red-900 rounded">
          {this.props.label ?? 'Chart'} failed to render: {this.state.message}
        </div>
      )
    }
    return this.props.children
  }
}
