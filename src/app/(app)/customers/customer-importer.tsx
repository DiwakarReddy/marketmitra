'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { Upload, CheckCircle2, AlertCircle, Download, FileText, X, Loader2 } from 'lucide-react'

export function CustomerImporter() {
  const { toast } = useToast()
  const [file, setFile] = useState<File | null>(null)
  const [csvText, setCsvText] = useState('')
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [open, setOpen] = useState(false)

  const handleFile = (f: File) => {
    setFile(f)
    const reader = new FileReader()
    reader.onload = (e) => setCsvText(e.target?.result as string)
    reader.readAsText(f)
  }

  const upload = async () => {
    if (!csvText) return
    setUploading(true)
    try {
      const res = await fetch('/api/customers/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv: csvText }),
      })
      const data = await res.json()
      setResult(data)
      toast({
        title: `Imported ${data.imported} customers`,
        description: data.errors?.length ? `${data.errors.length} rows had errors` : 'All rows imported successfully',
        variant: data.errors?.length ? 'warning' as any : 'success',
      })
    } catch (err: any) {
      toast({ title: 'Import failed', description: err.message, variant: 'error' })
    } finally {
      setUploading(false)
    }
  }

  const downloadTemplate = () => {
    const template = `name,phone,email,birthday,anniversary,language,tags,notes
"Riya Sharma",9876543210,riya@example.com,1995-03-15,2020-11-26,hinglish,"vip,returning","Prefers morning slots"
"Amit Patel",9876543211,amit@example.com,1988-07-22,,hi,"new",""
"Sunita Joshi",9876543212,,1965-12-08,,hi,,"Senior citizen - 20% discount"`
    const blob = new Blob([template], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'customers-template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Upload className="w-4 h-4" />
        Import customers from CSV
      </Button>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2"><Upload className="w-5 h-5 text-teal-600" />Import customers from CSV</CardTitle>
          <Button variant="ghost" size="icon" onClick={() => { setOpen(false); setFile(null); setResult(null) }}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="text-sm text-blue-900">
            <strong>CSV format:</strong> name, phone, email, birthday (YYYY-MM-DD), anniversary, language, tags (comma-separated), notes
          </div>
          <Button size="sm" variant="outline" onClick={downloadTemplate}>
            <Download className="w-3 h-3" />Template
          </Button>
        </div>

        {!file ? (
          <label className="block">
            <div className="border-2 border-dashed border-ink-200 rounded-lg p-8 text-center cursor-pointer hover:bg-ink-50">
              <FileText className="w-8 h-8 text-ink-400 mx-auto mb-2" />
              <p className="text-sm text-ink-700 font-medium">Click to upload CSV</p>
              <p className="text-xs text-ink-500 mt-1">or drag and drop</p>
            </div>
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
          </label>
        ) : (
          <div className="space-y-3">
            <div className="p-3 bg-ink-50 rounded-lg flex items-center gap-2">
              <FileText className="w-4 h-4 text-ink-500" />
              <div className="flex-1 text-sm">
                <div className="font-medium">{file.name}</div>
                <div className="text-xs text-ink-500">{(file.size / 1024).toFixed(1)} KB</div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => { setFile(null); setCsvText('') }}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            <Button variant="brand" onClick={upload} disabled={uploading} className="w-full">
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {uploading ? 'Importing...' : 'Import now'}
            </Button>
          </div>
        )}

        {result && (
          <div className="space-y-2">
            {result.imported > 0 && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex items-start gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1 text-sm">
                  <div className="font-bold text-green-900">✓ Imported {result.imported} customers</div>
                  {result.skipped > 0 && <div className="text-green-800">Skipped {result.skipped} duplicates</div>}
                </div>
              </div>
            )}
            {result.errors?.length > 0 && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 text-sm">
                    <div className="font-bold text-amber-900">{result.errors.length} rows had errors:</div>
                    <ul className="mt-1 space-y-0.5 text-xs text-amber-800">
                      {result.errors.slice(0, 5).map((err: any, i: number) => (
                        <li key={i}>Row {err.row}: {err.error}</li>
                      ))}
                      {result.errors.length > 5 && <li>+ {result.errors.length - 5} more</li>}
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}