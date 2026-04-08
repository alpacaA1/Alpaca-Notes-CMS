type UnsupportedBannerProps = {
  message: string
}

export default function UnsupportedBanner({ message }: UnsupportedBannerProps) {
  return (
    <div className="unsupported-banner">
      <p className="unsupported-banner__eyebrow">兼容性提醒</p>
      <strong>已切回 Markdown 编辑</strong>
      <span>{message}</span>
    </div>
  )
}
