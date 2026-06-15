<script>
export default {
  onLaunch() {
    console.log('Cyber-Pendant launched');
  }
};
</script>

<style>
page {
  min-height: 100%;
  background: #f6f3ee;
  color: #1a1a1a;
  font-family:
    Inter,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
}

view,
text,
input,
textarea,
button {
  box-sizing: border-box;
}

button {
  border-radius: 0;
}

.page-shell {
  min-height: 100vh;
  background: #f6f3ee;
}

.brand-mark {
  letter-spacing: 0;
  text-transform: uppercase;
}

.section-title {
  font-size: 34rpx;
  font-weight: 650;
  color: #151515;
}

.muted-text {
  color: #6b665f;
  line-height: 1.7;
}

.primary-button,
.secondary-button,
.ghost-button,
.danger-button {
  min-height: 88rpx;
  padding: 0 32rpx;
  border: 1px solid transparent;
  border-radius: 6rpx;
  font-size: 28rpx;
  line-height: 88rpx;
}

.primary-button {
  background: #171717;
  color: #fff;
}

.secondary-button {
  background: #fff;
  color: #171717;
  border-color: #d7d1c8;
}

.ghost-button {
  background: transparent;
  color: #171717;
  border-color: #c7c0b6;
}

.danger-button {
  background: #f7efec;
  color: #8d2e22;
  border-color: #e0c4bc;
}

.form-input,
.form-textarea,
.form-picker {
  width: 100%;
  min-height: 84rpx;
  border: 1px solid #d8d1c7;
  border-radius: 6rpx;
  background: #fffdf9;
  color: #181818;
  font-size: 28rpx;
  padding: 0 24rpx;
}

.form-textarea {
  min-height: 160rpx;
  padding-top: 20rpx;
  line-height: 1.6;
}

.field-label {
  display: block;
  margin-bottom: 12rpx;
  color: #625d55;
  font-size: 24rpx;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  min-height: 48rpx;
  padding: 0 18rpx;
  border-radius: 999rpx;
  font-size: 22rpx;
  background: #eef3f1;
  color: #2c6553;
}

.status-pill.inactive {
  background: #f5ece7;
  color: #8d3c22;
}

@media (min-width: 960px) {
  .primary-button,
  .secondary-button,
  .ghost-button,
  .danger-button {
    min-height: 44px;
    padding: 0 18px;
    font-size: 14px;
    line-height: 44px;
  }
}
</style>
