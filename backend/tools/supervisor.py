import time
import subprocess
import sys

def supervise():
    print('[SUPERVISOR] ApexSovereign Gateway Supervisor active.')
    while True:
        res = subprocess.run(['pgrep', '-f', 'paypal_webhook.py'])
        if res.returncode != 0:
            print('[SUPERVISOR] Gateway offline. Restarting...')
            subprocess.Popen(['python3', 'backend/tools/paypal_webhook.py'])
        time.sleep(5)

if __name__ == '__main__':
    supervise()
