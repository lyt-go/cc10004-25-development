import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

import App from './App'
import { bootstrapLocalData } from './data/bootstrap'
import './styles/global.css'

// 升级后先跑本地数据迁移，再渲染页面。
const migrationReport = bootstrapLocalData()
if (migrationReport.notes.length > 0) {
  console.info('[本地数据迁移]', migrationReport.notes.join('；'))
}

ReactDOM.createRoot(document.getElementById('app') as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
