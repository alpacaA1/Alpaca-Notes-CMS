type UnsupportedBannerProps = {
  message: string
}

export default function UnsupportedBanner({ message }: UnsupportedBannerProps) {
  return <div className="unsupported-banner">{message}</div>
}
