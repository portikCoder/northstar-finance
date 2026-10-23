import { expect, test } from '@playwright/test'

test('Power user target mix updates assumptions and the comparison', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') pageErrors.push(message.text())
  })

  await page.goto('/')
  await page.getByRole('button', { name: 'Power user' }).click()

  const monteCarloRuns = page.getByLabel('Monte Carlo paths')
  await monteCarloRuns.fill('100')

  const targetMix = page.locator('#equity-allocation')
  const updateStartedAt = Date.now()
  await targetMix.evaluate((element: HTMLInputElement) => {
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    setValue?.call(element, '50')
    element.dispatchEvent(new Event('input', { bubbles: true }))
    element.dispatchEvent(new Event('change', { bubbles: true }))
  })

  await expect(targetMix).toHaveAttribute('aria-valuetext', '50% equities, 50% bonds')
  await expect(page.getByText('Weighted gross return', { exact: false })).toBeVisible()
  await expect(page.locator('.derived-assumptions')).toContainText('5.00%')
  await expect(page.locator('.portfolio-mix-comparison')).toContainText('Keep current 100/0 vs target 50/50')
  await expect(page.locator('.portfolio-mix-comparison')).toContainText('Use target mix')
  expect(Date.now() - updateStartedAt).toBeLessThan(2_500)
  expect(pageErrors).toEqual([])
})
