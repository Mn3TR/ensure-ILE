import { Badge } from '../components/ui/badge.tsx'
import { Button } from '../components/ui/button.tsx'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.tsx'
import { Input } from '../components/ui/input.tsx'
import { Label } from '../components/ui/label.tsx'
import { RadioGroup, RadioGroupItem } from '../components/ui/radio-group.tsx'
import { Switch } from '../components/ui/switch.tsx'

const swatches = [
  { name: '纸', token: 'background', className: 'bg-background' },
  { name: '墨', token: 'foreground', className: 'bg-foreground' },
  { name: '墨蓝', token: 'primary', className: 'bg-primary' },
  { name: '朱批', token: 'destructive', className: 'bg-destructive' },
  { name: '印章青', token: 'seal', className: 'bg-seal' },
]

/** 视觉层的活体样本：改 token 就能在这里看出影响。 */
export function GalleryApp() {
  return (
    <div className="min-h-full bg-background text-foreground">
      <div className="mx-auto max-w-[640px] px-8 py-10">
        <h1 className="font-song text-2xl leading-10 font-semibold">演算纸</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          三种笔迹分工：宋体是印刷体，楷体是手写，黑体是界面本身。
        </p>

        <h2 className="mt-10 text-sm font-semibold">字</h2>
        <div className="mt-3 space-y-2">
          <div><span className="text-xs text-muted-foreground">题干 · 宋体 17/30</span>
            <p className="font-song text-[17px] leading-[30px]">求 f(x) 的值域。</p></div>
          <div><span className="text-xs text-muted-foreground">学生原话 · 楷体 16/28</span>
            <p className="font-kai text-base leading-7">根在 1 和 2 之间。</p></div>
          <div><span className="text-xs text-muted-foreground">界面 · 黑体 14/22</span>
            <p className="text-sm">下一步：先把这个根夹到两位小数。</p></div>
        </div>

        <h2 className="mt-10 text-sm font-semibold">色（只编码状态）</h2>
        <div className="mt-3 space-y-2">
          {swatches.map(s => (
            <div key={s.token} className="flex items-center gap-3 text-sm text-muted-foreground">
              <i className={`size-4 rounded-sm border border-border ${s.className}`} />
              <span className="text-foreground">{s.name}</span>
              <span className="tabular-nums">{s.token}</span>
            </div>
          ))}
        </div>

        <h2 className="mt-10 text-sm font-semibold">按钮</h2>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button>接着做</Button>
          <Button variant="outline">先放一边</Button>
          <Button variant="ghost">取消</Button>
          <Button variant="destructive">判定不对</Button>
        </div>

        <h2 className="mt-10 text-sm font-semibold">表单</h2>
        <div className="mt-3 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="grade">年级</Label>
            <Input id="grade" defaultValue="高一 · 人教版" />
          </div>
          <RadioGroup defaultValue="think" className="gap-2">
            <div className="flex items-center gap-2"><RadioGroupItem value="answer" id="r1" /><Label htmlFor="r1">直接给答案</Label></div>
            <div className="flex items-center gap-2"><RadioGroupItem value="think" id="r2" /><Label htmlFor="r2">讲思路，别给答案</Label></div>
          </RadioGroup>
          <div className="flex items-center justify-between">
            <Label htmlFor="notify">每晚提醒复习</Label>
            <Switch id="notify" />
          </div>
        </div>

        <h2 className="mt-10 text-sm font-semibold">卡片与标记</h2>
        <div className="mt-3 space-y-3">
          <Card>
            <CardHeader><CardTitle className="text-sm">20261025-math-2d1ed2</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <p className="font-song text-[17px] leading-[30px]">求 f(x) 的值域。</p>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">引导中</Badge>
                <Badge variant="outline">下次复习 3 天后</Badge>
              </div>
            </CardContent>
          </Card>
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            这一步的最后一跳还是猜的：「1.52 左右」。
          </div>
        </div>
      </div>
    </div>
  )
}
