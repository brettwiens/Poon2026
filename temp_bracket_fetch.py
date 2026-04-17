import requests

def main():
    url = 'https://www.nhl.com/playoffs/2026/bracket'
    r = requests.get(url, timeout=20)
    print('status', r.status_code)
    t = r.text
    idx = t.find('series-e')
    print('idx', idx)
    print(t[idx-200:idx+500])

if __name__ == '__main__':
    main()
