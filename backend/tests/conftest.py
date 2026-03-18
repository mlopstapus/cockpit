"""Shared pytest fixtures."""
import sys
import os

# Ensure backend root is on the path
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
