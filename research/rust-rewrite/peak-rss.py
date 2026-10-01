"""Print peak RSS (MB) of a command: python3 peak-rss.py <cmd...>"""
import resource, subprocess, sys
subprocess.run(sys.argv[1:], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
print(round(resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss / 1024, 1))
